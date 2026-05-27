/// <reference lib="webworker" />
  import { pipeline, env } from '@huggingface/transformers';

  env.allowLocalModels = false; 

  let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;
  
  async function init() {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    });
    self.postMessage({ type: 'ready' });
  }
  
  self.addEventListener('message', async (event: MessageEvent) => {
    const { type, texts, reqId } = event.data;
    if (type !== 'embed') return;
    try {   
      if (!extractor) throw new Error('Model not ready');
      const output = await (extractor as any)(texts, { pooling: 'mean', normalize: true
  });
      const vectors = output.tolist() as number[][];
      self.postMessage({ type: 'embedResult', reqId, vectors });
    } catch (e) {
      self.postMessage({ type: 'error', reqId, message: (e as Error).message });
    }
  });

  init();