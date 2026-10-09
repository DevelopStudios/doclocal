/// <reference lib="webworker" />
  import { pipeline, env } from '@huggingface/transformers';

  env.allowLocalModels = false; 

  // Requests that arrive while the model is still downloading wait for it instead of failing
  // (a PDF dropped in right after page load used to get "Model not ready" and an empty index).
  // q8 rather than fp32, measured on the shared evaluation fixtures (issue #62):
  // identical retrieval at the k=5 this app queries with, a median embed slightly faster than
  // fp32, and 22.6 MB to download instead of 86.9 MB. On the free tier the download is the
  // binding constraint -- it is the one model a phone can still run -- so 74% off it is worth
  // more than the one place accuracy moves: a single fixture question whose correct chunk falls
  // from rank 2 to rank 3, still comfortably inside k=5.
  const model = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
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

