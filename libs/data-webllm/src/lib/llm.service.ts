import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { LOCAL_MODEL, NO_WEBGPU, loadFailureMessage, webgpuUnavailable } from './local-model';

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
      if (e.data.type === 'loaded') {
        this.loading.set(false);
        this.loaded.set(true);
      }
      if (e.data.type === 'error' && !e.data.reqId) {
        this.loading.set(false);
        // WebLLM's text carries paths and stack frames; the reader gets a sentence.
        this.error.set(loadFailureMessage(e.data.message));
      }
    });
    // addEventListener (unlike onmessage) does not start the port implicitly.
    this.port.start();
  }

  /**
   * Start the download and load. Checked for WebGPU first: without it there is
   * nothing the worker could attempt, and a multi-GB fetch would be wasted before
   * failing anyway.
   */
  load(modelId = LOCAL_MODEL): void {
    this.loaded.set(false);
    if (webgpuUnavailable(globalThis.navigator)) {
      this.loading.set(false);
      this.error.set(loadFailureMessage(NO_WEBGPU));
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.port.postMessage({ type: 'load', modelId });
  }

  /**
   * Stream an answer. `system` carries the rules (kept out of the user turn so small
   * models hold the citation format), `maxTokens` caps the answer length.
   */
  generate$(prompt: string, system?: string, maxTokens?: number): Observable<LlmToken> {
    return new Observable((observer) => {
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
      this.port.postMessage({ type: 'generate', prompt, reqId, system, maxTokens });
      return () => {
        this.port.removeEventListener('message', handler);
        this.port.postMessage({ type: 'abort', reqId });
      };
    });
  }
}
