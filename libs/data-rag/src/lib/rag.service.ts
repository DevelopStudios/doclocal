import { Injectable, signal } from '@angular/core';
  import { Observable } from 'rxjs';
  import type { PdfChunk } from '@doclocal/data-pdf';
  import { cosineSimilarity } from './cosine';

  export interface RagResult {  
    chunk: PdfChunk;
    score: number;
  }

  interface IndexedChunk {
    chunk: PdfChunk;
    vector: Float32Array;
  }

  @Injectable({ providedIn: 'root' })
  export class RagService {
    private vectorIndex: IndexedChunk[] = [];
    private worker = new Worker(
      new URL('./embed.worker', import.meta.url),
      { type: 'module' } 
    );

    readonly indexing = signal(false);
    readonly ready = signal(false);

    buildIndex$(chunks: PdfChunk[]): Observable<number> {
      return new Observable(observer => {
        this.indexing.set(true);
        this.ready.set(false);
        const reqId = crypto.randomUUID();
  
        const handler = (e: MessageEvent) => {
          if (e.data.reqId !== reqId) return;
          if (e.data.type === 'embedResult') {
            this.vectorIndex = chunks.map((chunk, i) => ({
              chunk,  
              vector: new Float32Array(e.data.vectors[i]),
            }));
            this.indexing.set(false);
            this.ready.set(true);
            observer.next(this.vectorIndex.length);
            observer.complete();
            this.worker.removeEventListener('message', handler);
          }
          if (e.data.type === 'error') {
            this.indexing.set(false);
            observer.error(new Error(e.data.message));
            this.worker.removeEventListener('message', handler);
          }
        };

        this.worker.addEventListener('message', handler);
        this.worker.postMessage({ type: 'embed', texts: chunks.map(c => c.text), reqId
  });
        return () => this.worker.removeEventListener('message', handler);
      });
    }

    query$(queryText: string, k = 5): Observable<RagResult[]> {
      return new Observable(observer => {
        const reqId = crypto.randomUUID();

        const handler = (e: MessageEvent) => {
          if (e.data.reqId !== reqId) return;
          if (e.data.type === 'embedResult') {
            const queryVec = new Float32Array(e.data.vectors[0]);
            const results = this.vectorIndex
              .map(({ chunk, vector }) => ({ chunk, score: cosineSimilarity(queryVec,
  vector) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, k);
            observer.next(results);
            observer.complete();
            this.worker.removeEventListener('message', handler);
          }
          if (e.data.type === 'error') {
            observer.error(new Error(e.data.message));
            this.worker.removeEventListener('message', handler);
          }
        };
  
        this.worker.addEventListener('message', handler);
        this.worker.postMessage({ type: 'embed', texts: [queryText], reqId });
        return () => this.worker.removeEventListener('message', handler);
      });
    }

    clear(): void {
      this.vectorIndex = [];
      this.ready.set(false);
    }
  }