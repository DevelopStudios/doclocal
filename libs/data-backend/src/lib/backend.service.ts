import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { PdfChunk } from '@doclocal/data-pdf';
import { parseSseFrames } from './sse-decoder';

/** Same-origin prefix; the dev proxy (or a deployment's server-side proxy) adds credentials. */
export const BACKEND_BASE = '/api';

export interface BackendCitation {
  chunkId: string;
  text: string;
  pageNumber: number;
  startWord: number;
  score: number;
}

export type BackendChatEvent =
  | { type: 'citations'; citations: BackendCitation[] }
  | { type: 'token'; token: string }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; message: string; code: string; retryable: boolean };

function httpHint(status: number): string {
  if (status === 401) return 'The backend rejected the proxy token; check DOCLOCAL_BACKEND_TOKEN.';
  if (status === 409) return 'Wait for indexing or replace the document.';
  if (status === 413) return 'This document is too large for the backend.';
  if (status === 429) return 'Please wait before trying again.';
  if (status === 502 || status === 504)
    return 'The backend is unreachable; check that it is running.';
  if (status === 503) return 'NVIDIA NIM is not configured or unavailable on the backend.';
  return 'Try again or check the backend configuration.';
}

export class BackendHttpError extends Error {
  constructor(readonly status: number) {
    super(`Backend request failed (${status}). ${httpHint(status)}`);
  }
}

@Injectable({ providedIn: 'root' })
export class BackendService {
  private sessionId: string | null = null;
  private cachedChunks: PdfChunk[] = [];
  private generation = 0;
  private controllers = new Set<AbortController>();
  readonly sessionStatus = signal<'none' | 'creating' | 'ready' | 'indexing' | 'error'>('none');
  readonly sessionError = signal<string | null>(null);

  clearSession(): void {
    this.invalidate();
    this.sessionId = null;
    this.cachedChunks = [];
    this.sessionStatus.set('none');
    this.sessionError.set(null);
  }

  private invalidate(): void {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  private async request(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    return fetch(`${BACKEND_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
      redirect: 'error',
    });
  }

  private current(generation: number, signal: AbortSignal): void {
    if (signal.aborted || generation !== this.generation)
      throw new DOMException('Document operation cancelled', 'AbortError');
  }

  private async remove(id: string): Promise<void> {
    const response = await fetch(`${BACKEND_BASE}/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: true,
      credentials: 'same-origin',
      redirect: 'error',
    });
    if (!response.ok && response.status !== 404) throw new BackendHttpError(response.status);
  }

  private async create(generation: number, signal: AbortSignal): Promise<string> {
    const response = await this.request('/sessions', {}, signal);
    if (!response.ok) throw new BackendHttpError(response.status);
    const { sessionId } = await response.json();
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid backend session response.');
    if (signal.aborted || generation !== this.generation) {
      // An already completed POST can race cancellation. Delete its orphaned session.
      void this.remove(sessionId).catch(() => undefined);
      this.current(generation, signal);
    }
    this.sessionId = sessionId;
    return sessionId;
  }

  private async index(
    chunks: PdfChunk[],
    generation: number,
    signal: AbortSignal,
    recover = true,
  ): Promise<void> {
    this.current(generation, signal);
    const id = this.sessionId ?? (await this.create(generation, signal));
    this.current(generation, signal);
    const response = await this.request(
      '/documents/index',
      {
        session_id: id,
        chunks: chunks.map((c) => ({
          id: c.id,
          text: c.text,
          page_number: c.pageNumber,
          start_word: c.startWord,
        })),
      },
      signal,
    );
    this.current(generation, signal);
    if (response.status === 404 && recover) {
      this.sessionId = null;
      return this.index(chunks, generation, signal, false);
    }
    if (!response.ok) throw new BackendHttpError(response.status);
  }

  indexDocument$(chunks: PdfChunk[]): Observable<void> {
    return new Observable((observer) => {
      this.invalidate();
      const generation = this.generation;
      const controller = new AbortController();
      this.controllers.add(controller);
      this.cachedChunks = chunks.map((c) => ({ ...c }));
      this.sessionStatus.set('indexing');
      this.sessionError.set(null);
      void this.index(this.cachedChunks, generation, controller.signal)
        .then(() => {
          this.current(generation, controller.signal);
          this.sessionStatus.set('ready');
          observer.next();
          observer.complete();
        })
        .catch((error: Error) => {
          if (controller.signal.aborted || generation !== this.generation) return;
          this.sessionStatus.set('error');
          this.sessionError.set(error.message);
          observer.error(error);
        });
      return () => {
        controller.abort();
        this.controllers.delete(controller);
        if (generation === this.generation && this.sessionStatus() === 'indexing')
          this.sessionStatus.set('none');
      };
    });
  }

  chat$(question: string): Observable<BackendChatEvent> {
    return new Observable((observer) => {
      const generation = this.generation;
      const chunks = this.cachedChunks;
      const controller = new AbortController();
      this.controllers.add(controller);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const run = async (): Promise<void> => {
        try {
          this.current(generation, controller.signal);
          let response = await this.request(
            '/chat',
            { session_id: this.sessionId, question },
            controller.signal,
          );
          this.current(generation, controller.signal);
          if (response.status === 404) {
            this.sessionId = null;
            await this.index(chunks, generation, controller.signal, false);
            this.current(generation, controller.signal);
            response = await this.request(
              '/chat',
              { session_id: this.sessionId, question },
              controller.signal,
            );
          }
          this.current(generation, controller.signal);
          if (!response.ok) throw new BackendHttpError(response.status);
          if (!response.body) throw new Error('Backend stream has no body.');
          reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            this.current(generation, controller.signal);
            if (done)
              throw new Error('Stream closed without a terminal event; answer is incomplete.');
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 262144) throw new Error('Backend stream frame exceeded its limit.');
            const parsed = parseSseFrames(buffer);
            buffer = parsed.remainder;
            for (const frame of parsed.frames) {
              if (!['citations', 'token', 'done', 'error'].includes(frame.event)) continue;
              const data = JSON.parse(frame.data);
              if (frame.event === 'citations') {
                if (!Array.isArray(data.citations)) throw new Error('Invalid backend citations.');
                observer.next({ type: 'citations', citations: data.citations });
              } else if (frame.event === 'token') {
                if (typeof data.token !== 'string') throw new Error('Invalid backend token.');
                observer.next({ type: 'token', token: data.token });
              } else {
                if (frame.event === 'done')
                  observer.next({ type: 'done', finishReason: data.finishReason });
                else
                  observer.next({
                    type: 'error',
                    message: String(data.message ?? 'Backend failed'),
                    code: String(data.code ?? 'internal'),
                    retryable: data.retryable === true,
                  });
                observer.complete();
                return;
              }
            }
          }
        } catch (error) {
          if (!controller.signal.aborted && generation === this.generation) observer.error(error);
        } finally {
          if (reader) {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          this.controllers.delete(controller);
        }
      };
      void run();
      return () => {
        controller.abort();
        void reader?.cancel().catch(() => undefined);
        this.controllers.delete(controller);
      };
    });
  }

  deleteSession$(): Observable<void> {
    return new Observable((observer) => {
      const id = this.sessionId;
      // Detach synchronously: an old DELETE must never clear a newer session.
      this.clearSession();
      if (!id) {
        observer.complete();
        return;
      }
      void this.remove(id)
        .then(() => observer.complete())
        .catch((error) => observer.error(error));
    });
  }
}
