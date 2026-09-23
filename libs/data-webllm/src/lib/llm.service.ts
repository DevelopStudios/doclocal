import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

export const DEFAULT_MODEL = 'Qwen2.5-3B-Instruct-q4f16_1-MLC';
  
  export interface LlmToken {
    token: string;
  }

  @Injectable({ providedIn: 'root' })
  export class LlmService {
    // Use the shared worker that owns a single internal worker.
    private shared = new SharedWorker(new URL('./shared-llm.worker', import.meta.url));
    private port = this.shared.port;

    readonly loading = signal(false);
    readonly loaded = signal(false);
    readonly loadProgress = signal(0);
    readonly tokensPerSec = signal(0);
    readonly error = signal<string | null>(null);
  
    constructor() {
      this.port.addEventListener('message', (e: MessageEvent) => {
        if (e.data.type === 'loadProgress') this.loadProgress.set(e.data.progress);
        if (e.data.type === 'loaded') { this.loading.set(false); this.loaded.set(true); }
        if (e.data.type === 'error' && !e.data.reqId) {
          this.loading.set(false);
          this.error.set(e.data.message);
        }
      });
      // addEventListener (unlike onmessage) does not start the port implicitly.
      this.port.start();
    }

    load(modelId = DEFAULT_MODEL): void {
      this.loading.set(true);
      this.loaded.set(false);
      this.error.set(null);
      this.port.postMessage({ type: 'load', modelId });
    }

    generate$(prompt: string): Observable<LlmToken> {
      return new Observable(observer => {
        const reqId = crypto.randomUUID();

        const handler = (e: MessageEvent) => {
          if (e.data.reqId !== reqId) return;
          if (e.data.type === 'token') observer.next({ token: e.data.token });
          if (e.data.type === 'done') {
            observer.complete();
            this.port.removeEventListener('message', handler);
          }
          if (e.data.type === 'error') {
            observer.error(new Error(e.data.message));
            this.port.removeEventListener('message', handler);
          } 
        };

        this.port.addEventListener('message', handler);
        this.port.postMessage({ type: 'generate', prompt, reqId });
        return () => this.port.postMessage({ type: 'abort', reqId });
      });   
    }
  }