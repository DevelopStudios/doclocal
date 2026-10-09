import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { BackendChatEvent } from '@doclocal/data-backend';
import type { PdfChunk } from '@doclocal/data-pdf';
import { RagService } from '@doclocal/data-rag';
import { LlmService } from '@doclocal/data-webllm';

/**
 * The on-device answer path, shaped like `BackendService` so the chat panel and the
 * workspace can use it unchanged (issue #57; the real tier selection is #59/#60).
 *
 * Nothing here calls the hosted backend: the document is embedded by `data-rag` in a
 * worker and answered by `data-webllm` on WebGPU, so a session costs nothing to serve
 * and no page text leaves the browser.
 */
// Lowest rung #56 measured as presentable. #59 replaces this with a capability probe.
const LOCAL_MODEL = 'Qwen3.5-2B-q4f16_1-MLC';

// Interim prompt so the local path is usable end to end; #58 owns the hardened version.
const SYSTEM = [
  'You answer questions about a document using only the excerpts given to you.',
  'Cite every claim with the number of the excerpt it came from, like [1].',
  'Answer in at most 3 sentences. Start with the answer; never open with a preamble.',
  'If the excerpts do not contain the answer, reply exactly: I could not find that in the document.',
].join('\n');

@Injectable()
export class LocalBackend {
  private readonly rag = inject(RagService);
  private readonly llm = inject(LlmService);

  readonly sessionStatus = signal<'none' | 'creating' | 'ready' | 'indexing' | 'error'>('none');
  readonly sessionError = signal<string | null>(null);

  /** Model download state, for the workspace to show while the session is preparing. */
  readonly modelLoading = this.llm.loading;
  readonly modelProgress = this.llm.loadProgress;
  readonly modelReady = this.llm.loaded;

  private chunks: PdfChunk[] = [];
  private modelRequested = false;

  clearSession(): void {
    this.chunks = [];
    this.rag.clear();
    this.sessionStatus.set('none');
    this.sessionError.set(null);
  }

  /** Embed the document locally. The model download starts alongside it. */
  indexDocument$(chunks: PdfChunk[]): Observable<void> {
    this.chunks = chunks;
    this.sessionError.set(null);
    this.sessionStatus.set('indexing');
    this.ensureModel();

    return new Observable<void>(observer => {
      let cancelled = false;
      const sub = this.rag.buildIndex$(chunks).subscribe({
        error: (e: Error) => {
          this.sessionError.set(e.message);
          this.sessionStatus.set('error');
          observer.error(e);
        },
        complete: () => {
          // The index is only half of it: generating before the weights finish
          // downloading fails with "Engine not loaded", so the session stays in
          // `indexing` — which keeps the composer disabled — until both are in.
          void this.whenModelReady().then(() => {
            if (cancelled) return;
            if (this.llm.error()) {
              this.sessionError.set(this.llm.error());
              this.sessionStatus.set('error');
              observer.error(new Error(this.llm.error() ?? 'Model failed to load'));
              return;
            }
            this.sessionStatus.set('ready');
            observer.complete();
          });
        },
      });
      return () => {
        cancelled = true;
        sub.unsubscribe();
      };
    });
  }

  chat$(question: string): Observable<BackendChatEvent> {
    return new Observable<BackendChatEvent>(observer => {
      let generation: { unsubscribe(): void } | null = null;

      const retrieval = this.rag.query$(question, 5).subscribe({
        error: (e: Error) =>
          observer.next({
            type: 'error',
            message: e.message,
            code: 'retrieval_failed',
            retryable: true,
          }),
        next: results => {
          observer.next({
            type: 'citations',
            citations: results.map(r => ({
              chunkId: r.chunk.id,
              text: r.chunk.text,
              pageNumber: r.chunk.pageNumber,
              startWord: r.chunk.startWord,
              score: r.score,
            })),
          });

          const prompt = [
            ...results.map((r, i) => `[${i + 1}] ${r.chunk.text}`),
            '',
            `Question: ${question}`,
          ].join('\n');

          generation = this.llm.generate$(prompt, SYSTEM, 400).subscribe({
            next: ({ token }) => observer.next({ type: 'token', token }),
            error: (e: Error) => {
              observer.next({
                type: 'error',
                message: e.message,
                code: 'generation_failed',
                retryable: true,
              });
              observer.complete();
            },
            complete: () => {
              observer.next({ type: 'done' });
              observer.complete();
            },
          });
        },
      });

      return () => {
        retrieval.unsubscribe();
        generation?.unsubscribe();
      };
    });
  }

  /** Nothing is stored off-device, so ending a session is just dropping local state. */
  deleteSession$(): Observable<void> {
    return new Observable<void>(observer => {
      this.clearSession();
      observer.complete();
    });
  }

  private whenModelReady(): Promise<void> {
    return new Promise(resolve => {
      const settled = () => this.llm.loaded() || this.llm.error() !== null;
      if (settled()) return resolve();
      const timer = setInterval(() => {
        if (!settled()) return;
        clearInterval(timer);
        resolve();
      }, 250);
    });
  }

  private ensureModel(): void {
    if (this.modelRequested) return;
    this.modelRequested = true;
    this.llm.load(LOCAL_MODEL);
  }
}
