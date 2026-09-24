import { Injectable, signal } from '@angular/core';
  import { Observable } from 'rxjs';
  import type { PdfChunk } from '@doclocal/data-pdf';
  import { cosineSimilarity } from './cosine';
  import { evenlySpaced } from './spread';
  import { batches } from './batches';

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
    /** Chunks embedded so far while indexing. */
    readonly progress = signal({ done: 0, total: 0 });
    readonly error = signal<string | null>(null);

    /**
     * Embeds the chunks in batches so progress can be shown. The index only becomes queryable
     * (`ready`) once every batch is in; the observable emits the running count of embedded chunks.
     */
    buildIndex$(chunks: PdfChunk[], batchSize = 8): Observable<number> {
      return new Observable(observer => {
        this.vectorIndex = [];
        this.indexing.set(true);
        this.ready.set(false);
        this.error.set(null);
        this.progress.set({ done: 0, total: chunks.length });

        const groups = batches(chunks, batchSize);
        const built: IndexedChunk[] = [];
        let batch = 0;
        let reqId = '';

        const finish = () => {
          this.vectorIndex = built;
          this.indexing.set(false);
          this.ready.set(true);
          observer.complete();
        };
        const send = () => {
          reqId = crypto.randomUUID();
          this.worker.postMessage({ type: 'embed', texts: groups[batch].map(c => c.text), reqId });
        };

        const handler = (e: MessageEvent) => {
          if (e.data.reqId !== reqId) return;
          if (e.data.type === 'embedResult') {
            groups[batch].forEach((chunk, j) => built.push({ chunk, vector: new Float32Array(e.data.vectors[j]) }));
            this.progress.set({ done: built.length, total: chunks.length });
            observer.next(built.length);
            batch++;
            if (batch < groups.length) send();
            else { this.worker.removeEventListener('message', handler); finish(); }
          }
          if (e.data.type === 'error') {
            this.worker.removeEventListener('message', handler);
            this.indexing.set(false);
            this.error.set(e.data.message);
            observer.error(new Error(e.data.message));
          }
        };

        if (groups.length === 0) {
          finish();
          return;
        }
        this.worker.addEventListener('message', handler);
        send();
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

    /** `k` indexed chunks spread across the whole document, for questions about all of it. */
    overview(k = 8): RagResult[] {
      return evenlySpaced(this.vectorIndex, k).map(({ chunk }) => ({ chunk, score: 1 }));
    }

    clear(): void {
      this.vectorIndex = [];
      this.ready.set(false);
      this.error.set(null);
      this.progress.set({ done: 0, total: 0 });
    }
  }