import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

export const DEFAULT_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC';
  
  export interface LlmToken {
    token: string;
  }

  @Injectable({ providedIn: 'root' })
  export class LlmService {
    private worker = new Worker(
      new URL('./llm.worker', import.meta.url),
      { type: 'module' } 
    );

    readonly loading = signal(false);
    readonly loaded = signal(false);
    readonly loadProgress = signal(0);
    readonly tokensPerSec = signal(0);
    readonly error = signal<string | null>(null);
  
    constructor() {
      this.worker.addEventListener('message', (e: MessageEvent) => {
        if (e.data.type === 'loadProgress') this.loadProgress.set(e.data.progress);
        if (e.data.type === 'loaded') { this.loading.set(false); this.loaded.set(true); }
        if (e.data.type === 'error' && !e.data.reqId) {
          this.loading.set(false);
          this.error.set(e.data.message);
        }   
      });
    }

    load(modelId = DEFAULT_MODEL): void {
      this.loading.set(true);
      this.loaded.set(false);
      this.error.set(null);
      this.worker.postMessage({ type: 'load', modelId });
    }

    generate$(prompt: string): Observable<LlmToken> {
      return new Observable(observer => {
        const reqId = crypto.randomUUID();

        const handler = (e: MessageEvent) => {
          if (e.data.reqId !== reqId) return;
          if (e.data.type === 'token') observer.next({ token: e.data.token });
          if (e.data.type === 'done') {
            observer.complete();
            this.worker.removeEventListener('message', handler);
          }
          if (e.data.type === 'error') {
            observer.error(new Error(e.data.message));
            this.worker.removeEventListener('message', handler);
          } 
        };

        this.worker.addEventListener('message', handler);
        this.worker.postMessage({ type: 'generate', prompt, reqId });
        return () => this.worker.postMessage({ type: 'abort', reqId });
      });   
    }
  }