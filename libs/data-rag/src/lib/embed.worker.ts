/// <reference lib="webworker" />
  import { pipeline, env } from '@huggingface/transformers';

  env.allowLocalModels = false; 

  // Requests that arrive while the model is still downloading wait for it instead of failing
  // (a PDF dropped in right after page load used to get "Model not ready" and an empty index).
  const model = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
  model.then(() => self.postMessage({ type: 'ready' }), () => undefined);

  self.addEventListener('message', async (event: MessageEvent) => {
    const { type, texts, reqId } = event.data;
    if (type !== 'embed') return;
    try {
      const extractor = await model;
      const output = await (extractor as any)(texts, { pooling: 'mean', normalize: true
  });
      const vectors = output.tolist() as number[][];
      self.postMessage({ type: 'embedResult', reqId, vectors });
    } catch (e) {
      self.postMessage({ type: 'error', reqId, message: (e as Error).message });
    }
  });

