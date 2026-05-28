/// <reference lib="webworker" />
  import { CreateMLCEngine } from '@mlc-ai/web-llm';
  import type { MLCEngineInterface } from '@mlc-ai/web-llm';

  let engine: MLCEngineInterface | null = null;

  self.addEventListener('message', async (event: MessageEvent) => {
    const { type, modelId, prompt, reqId } = event.data;

    if (type === 'load') {
      try {
        engine = await CreateMLCEngine(modelId, {
          initProgressCallback: (p) =>
            self.postMessage({ type: 'loadProgress', progress: p.progress }),
        });
        self.postMessage({ type: 'loaded' });
      } catch (e) {
        self.postMessage({ type: 'error', reqId: '', message: (e as Error).message });
      }
      return;
    }

    if (type === 'generate') {
      if (!engine) {  
        self.postMessage({ type: 'error', reqId, message: 'Engine not loaded' });
        return;
      }
      try {
        await engine.resetChat();
        const stream = await engine.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          max_tokens: 256,
        });
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content ?? '';
          if (token) self.postMessage({ type: 'token', reqId, token });
        }
        self.postMessage({ type: 'done', reqId });
      } catch (e) {   
        self.postMessage({ type: 'error', reqId, message: (e as Error).message });
      }
    }
  });
  