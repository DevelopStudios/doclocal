// Shared LLM worker.
// One instance per origin: it owns the WebLLM engine directly (SharedWorkers
// cannot spawn nested Workers, but do expose WebGPU), so the model is loaded
// once and shared by every open tab.
//
// Protocol (flat messages, same shape as the old dedicated worker):
//   in:  { type: 'load', modelId } | { type: 'generate', prompt, reqId, system?, maxTokens? }
//        | { type: 'abort', reqId }
//   out: { type: 'loadProgress', progress } | { type: 'loaded' } | { type: 'error', reqId: '', message }
//        { type: 'token' | 'done' | 'error', reqId, ... }   (sent to the requesting tab only)
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { ChatCompletionMessageParam, MLCEngineInterface } from '@mlc-ai/web-llm';
import { createThinkFilter } from './think-filter';

// Qwen3/Qwen3.5 are hybrid reasoning models. Left to themselves they spend the whole
// token budget on a <think> block and the answer never arrives — measured on
// Qwen3.5-0.8B, 2 of 3 questions returned no answer at all. Thinking off, greedy
// decoding, and a budget big enough for a 3-sentence cited answer.
const THINKING_OFF = { enable_thinking: false };
const DEFAULT_MAX_TOKENS = 400;

const ports = new Set<MessagePort>();
const activeReqs = new Map<string, MessagePort>(); // reqId => requesting port
const aborted = new Set<string>();

let engine: MLCEngineInterface | null = null;
let loadedModelId: string | null = null;
let loading: Promise<void> | null = null;
let lastProgress = 0;

// Generations run one at a time; the engine is shared between tabs.
let queue: Promise<void> = Promise.resolve();
let runningReqId: string | null = null;

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

interface GenerateRequest {
  prompt: string;
  reqId: string;
  system?: string;
  maxTokens?: number;
}

const generate = async (req: GenerateRequest, port: MessagePort) => {
  const { prompt, reqId, system, maxTokens } = req;
  if (!engine) {
    port.postMessage({ type: 'error', reqId, message: 'Engine not loaded' });
    return;
  }
  runningReqId = reqId;
  // Rules in a system message, document text only in the user message: small models
  // follow the citation format far better when the two are separated (see issue #58),
  // and the backend's prompt.py splits them for the same reason.
  const messages: ChatCompletionMessageParam[] = system
    ? [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];
  const think = createThinkFilter();
  try {
    await engine.resetChat();
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0,
      extra_body: THINKING_OFF,
    });
    for await (const chunk of stream) {
      if (aborted.has(reqId)) break;
      const raw = chunk.choices[0]?.delta?.content ?? '';
      // Filter before the token crosses the port, so no consumer can render a tag.
      const token = raw ? think.push(raw) : '';
      if (token) port.postMessage({ type: 'token', reqId, token });
    }
    if (!aborted.has(reqId)) {
      const tail = think.flush();
      if (tail) port.postMessage({ type: 'token', reqId, token: tail });
      port.postMessage({ type: 'done', reqId });
    }
  } catch (e) {
    if (!aborted.has(reqId)) {
      port.postMessage({ type: 'error', reqId, message: (e as Error).message });
    }
  } finally {
    runningReqId = null;
    aborted.delete(reqId);
    activeReqs.delete(reqId);
  }
};

onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  ports.add(port);

  port.onmessage = (ev: MessageEvent) => {
    const { type, modelId, prompt, reqId, system, maxTokens } = ev.data;
    switch (type) {
      case 'load':
        load(modelId, port);
        break;
      case 'generate':
        activeReqs.set(reqId, port);
        queue = queue.then(() => {
          if (!aborted.has(reqId)) return generate({ prompt, reqId, system, maxTokens }, port);
          aborted.delete(reqId);
          activeReqs.delete(reqId);
        });
        break;
      case 'abort':
        if (activeReqs.has(reqId)) {
          aborted.add(reqId);
          if (runningReqId === reqId) engine?.interruptGenerate();
        }
        break;
    }
  };
};

export {};
