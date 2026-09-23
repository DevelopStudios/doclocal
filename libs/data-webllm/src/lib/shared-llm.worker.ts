// Shared LLM worker.
// One instance per origin: it owns the WebLLM engine directly (SharedWorkers
// cannot spawn nested Workers, but do expose WebGPU), so the model is loaded
// once and shared by every open tab.
//
// Protocol (flat messages, same shape as the old dedicated worker):
//   in:  { type: 'load', modelId } | { type: 'generate', prompt, reqId } | { type: 'abort', reqId }
//   out: { type: 'loadProgress', progress } | { type: 'loaded' } | { type: 'error', reqId: '', message }
//        { type: 'token' | 'done' | 'error', reqId, ... }   (sent to the requesting tab only)
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { MLCEngineInterface } from '@mlc-ai/web-llm';

const ports = new Set<MessagePort>();
const activeReqs = new Map<string, MessagePort>(); // reqId => requesting port
const aborted = new Set<string>();

let engine: MLCEngineInterface | null = null;
let loadedModelId: string | null = null;
let loading: Promise<void> | null = null;
let lastProgress = 0;

// Generations run one at a time; the engine is shared between tabs.
let queue: Promise<void> = Promise.resolve();

const broadcast = (msg: unknown) => {
  for (const port of ports) port.postMessage(msg);
};

const load = (modelId: string, port: MessagePort) => {
  if (engine && loadedModelId === modelId) {
    port.postMessage({ type: 'loaded' });
    return;
  }
  if (loading) {
    // Already loading: this tab just follows the broadcast progress.
    port.postMessage({ type: 'loadProgress', progress: lastProgress });
    return;
  }
  loading = (async () => {
    try {
      // Free the previous model first — two models at once can exhaust GPU memory.
      const previous = engine;
      engine = null;
      loadedModelId = null;
      await previous?.unload();
      engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (p) => {
          lastProgress = p.progress;
          broadcast({ type: 'loadProgress', progress: p.progress });
        },
      });
      loadedModelId = modelId;
      broadcast({ type: 'loaded' });
    } catch (e) {
      broadcast({ type: 'error', reqId: '', message: (e as Error).message });
    } finally {
      loading = null;
    }
  })();
};

const generate = async (prompt: string, reqId: string, port: MessagePort) => {
  if (!engine) {
    port.postMessage({ type: 'error', reqId, message: 'Engine not loaded' });
    return;
  }
  try {
    await engine.resetChat();
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 512,
    });
    for await (const chunk of stream) {
      if (aborted.has(reqId)) break;
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) port.postMessage({ type: 'token', reqId, token });
    }
    if (!aborted.has(reqId)) port.postMessage({ type: 'done', reqId });
  } catch (e) {
    if (!aborted.has(reqId)) {
      port.postMessage({ type: 'error', reqId, message: (e as Error).message });
    }
  } finally {
    aborted.delete(reqId);
    activeReqs.delete(reqId);
  }
};

onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  ports.add(port);

  port.onmessage = (ev: MessageEvent) => {
    const { type, modelId, prompt, reqId } = ev.data;
    switch (type) {
      case 'load':
        load(modelId, port);
        break;
      case 'generate':
        activeReqs.set(reqId, port);
        queue = queue.then(() => {
          if (!aborted.has(reqId)) return generate(prompt, reqId, port);
          aborted.delete(reqId);
          activeReqs.delete(reqId);
        });
        break;
      case 'abort':
        if (activeReqs.has(reqId)) {
          aborted.add(reqId);
          engine?.interruptGenerate();
        }
        break;
    }
  };
};

export {};
