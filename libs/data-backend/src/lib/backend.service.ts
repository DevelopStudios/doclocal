import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { PdfChunk } from '@doclocal/data-pdf';
import { AuthService } from '@doclocal/data-auth';
import { parseSseFrames } from './sse-decoder';

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
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 409) return 'Wait for indexing or replace the document.';
  if (status === 413) return 'This document is too large for the backend.';
  if (status === 429) return 'Please wait before trying again.';
  if (status === 502 || status === 504)
    return 'The backend is unreachable; check that it is running.';
  if (status === 503) return 'NVIDIA NIM is not configured or unavailable on the backend.';
  return 'Try again or check the backend configuration.';
}

/** The backend's daily answer allowance is spent. A 429 with no code is not this. */
export const BUDGET_EXHAUSTED = 'nim_budget_exhausted';

/**
 * How long until capacity returns, in words.
 *
 * The budget window is a day, so `Retry-After` is hours. Rendering it as the seconds
 * a per-minute 429 would deserve ("try again in 14400 seconds") is accurate in the
 * protocol and useless on screen.
 */
export function resetPhrase(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 'later today';
  if (seconds < 90) return 'in under a minute';
  if (seconds < 3600) return `in about ${Math.round(seconds / 60)} minutes`;
  const hours = Math.round(seconds / 3600);
  return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function message(status: number, code: string | null, retryAfter: number | null): string {
  if (code === BUDGET_EXHAUSTED)
    return `Today's usage limit has been reached. New answers resume ${resetPhrase(retryAfter)}.`;
  return `Backend request failed (${status}). ${httpHint(status)}`;
}

export class BackendHttpError extends Error {
  constructor(
    readonly status: number,
    /** The backend's machine-readable reason, when it sent one. Branch on this. */
    readonly code: string | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message(status, code, retryAfterSeconds));
  }
}

/** The `code` a refusal body carries, or null. Never throws: a body may be empty,
 * truncated or not JSON at all, and the status still has to get through. */
async function errorCode(response: Response): Promise<string | null> {
  try {
    const body = await response.clone?.().json();
    const code = (body as Record<string, unknown>)?.['code'];
    return typeof code === 'string' && code ? code : null;
  } catch {
    return null;
  }
}

/** Optional by definition, so reading it must never turn a clean HTTP error into a
 * TypeError: the status is what the caller actually needs. */
function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers?.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly auth = inject(AuthService);
  // The Authorization value each response was requested with, so a 401 ends the right sign-in.
  private readonly sentWith = new WeakMap<Response, string | null>();
  private sessionId: string | null = null;
  private cachedChunks: PdfChunk[] = [];
  private generation = 0;
  private controllers = new Set<AbortController>();
  readonly sessionStatus = signal<'none' | 'creating' | 'ready' | 'indexing' | 'error'>('none');
  readonly sessionError = signal<string | null>(null);
  /**
   * Seconds until the daily answer allowance returns, or null while there is capacity.
   * Set from any refusal carrying `nim_budget_exhausted`, so one 429 is enough to put
   * the banner up and keep the composer disabled until the page is reloaded.
   */
  readonly capacitySpentFor = signal<number | null>(null);
  /** The demo's document is pinned server-side: this client may ask, not index. */
  private demoMode = false;

  clearSession(): void {
    this.invalidate();
    this.sessionId = null;
    this.cachedChunks = [];
    this.demoMode = false;
    this.sessionStatus.set('none');
    this.sessionError.set(null);
  }

  /**
   * Point this client at the demo's pinned document.
   *
   * The chunks come from the browser's own parse of the sample PDF, exactly as for an
   * uploaded document, but nothing is sent: the backend indexed the same text at boot.
   * The session id arrives with the demo token, on the first question.
   */
  useDemoDocument(chunks: PdfChunk[]): void {
    this.invalidate();
    this.sessionId = null;
    this.demoMode = true;
    this.cachedChunks = chunks.map((c) => ({ ...c }));
    this.sessionStatus.set('ready');
    this.sessionError.set(null);
  }

  private invalidate(): void {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  /** Every request carries this sign-in's token, so the backend owns documents per
   * person rather than trusting whatever the dev proxy used to inject. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const authorization = this.auth.authorizationHeader();
    return authorization ? { ...extra, Authorization: authorization } : extra;
  }

  /**
   * A 401 means the token that sent the request is no longer good, so the sign-in ends
   * rather than the request being retried. The token is the one this response was sent
   * with, not the current one: a sign-in that happened while the request was in flight
   * must not be cancelled by its reply.
   */
  private async rejected(response: Response): Promise<BackendHttpError> {
    if (response.status === 401) this.auth.handleUnauthorized(this.sentWith.get(response) ?? null);
    const code = await errorCode(response);
    if (code === BUDGET_EXHAUSTED) this.capacitySpentFor.set(retryAfter(response));
    return new BackendHttpError(response.status, code, retryAfter(response));
  }

  private async request(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    const token = this.auth.authorizationHeader();
    const response = await fetch(`${this.auth.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
      redirect: 'error',
    });
    this.sentWith.set(response, token);
    return response;
  }

  private current(generation: number, signal: AbortSignal): void {
    if (signal.aborted || generation !== this.generation)
      throw new DOMException('Document operation cancelled', 'AbortError');
  }

  private async remove(id: string): Promise<void> {
    const token = this.auth.authorizationHeader();
    const response = await fetch(`${this.auth.baseUrl}/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
      keepalive: true,
      credentials: 'same-origin',
      redirect: 'error',
    });
    this.sentWith.set(response, token);
    if (!response.ok && response.status !== 404) throw await this.rejected(response);
  }

  private async create(generation: number, signal: AbortSignal): Promise<string> {
    const response = await this.request('/sessions', {}, signal);
    if (!response.ok) throw await this.rejected(response);
    const { sessionId } = await response.json();
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid backend session response.');
    if (signal.aborted || generation !== this.generation) {
      // An already completed POST can race cancellation. Delete its orphaned session.
      void this.remove(sessionId).catch(() => undefined);
      this.current(generation, signal);
    }
    return sessionId;
  }

  private post(id: string, chunks: PdfChunk[], signal: AbortSignal): Promise<Response> {
    return this.request(
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
  }

  private async index(
    chunks: PdfChunk[],
    generation: number,
    signal: AbortSignal,
    recover = true,
  ): Promise<void> {
    this.current(generation, signal);
    const id = this.sessionId ?? (this.sessionId = await this.create(generation, signal));
    this.current(generation, signal);
    const response = await this.post(id, chunks, signal);
    this.current(generation, signal);
    if (response.status === 404 && recover) {
      this.sessionId = null;
      return this.index(chunks, generation, signal, false);
    }
    if (!response.ok) throw await this.rejected(response);
  }

  /**
   * Rebuilds an expired session for the current document. The new session is only published once
   * indexing succeeds for this generation; a cancelled or failed attempt deletes it, so a later
   * question can never reach an empty index and retries recovery instead.
   */
  private async recover(
    chunks: PdfChunk[],
    generation: number,
    signal: AbortSignal,
  ): Promise<string> {
    const id = await this.create(generation, signal);
    try {
      const response = await this.post(id, chunks, signal);
      this.current(generation, signal);
      if (!response.ok) throw await this.rejected(response);
    } catch (error) {
      void this.remove(id).catch(() => undefined);
      if ((error as Error).name === 'AbortError') throw error;
      throw new Error(
        `The backend session expired and could not be restored: ${(error as Error).message} ` +
          'Ask again to retry, or replace the document.',
      );
    }
    this.sessionId = id;
    return id;
  }

  /**
   * The pinned demo session, minting a demo token if there isn't one yet.
   *
   * Lazily, on the first question: minting on page load would burn a session and a
   * slot for every crawler, link preview and idle tab that ever touches the link, and
   * `POST /demo/session` is the one unauthenticated endpoint worth keeping cheap.
   */
  private async demoSession(generation: number, signal: AbortSignal): Promise<string> {
    const id = await this.auth.startDemo();
    this.current(generation, signal);
    if (!id) throw new Error(this.auth.error() ?? 'The demo is not available right now.');
    this.sessionId = id;
    return id;
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
          // A null session means an earlier recovery was cancelled or failed; retry it once.
          const recovered = !this.sessionId;
          let id =
            this.sessionId ??
            (this.demoMode
              ? await this.demoSession(generation, controller.signal)
              : await this.recover(chunks, generation, controller.signal));
          const ask = () => this.request('/chat', { session_id: id, question }, controller.signal);
          let response = await ask();
          this.current(generation, controller.signal);
          if (response.status === 404) {
            // Detach only the expired session; a newer one must survive.
            if (this.sessionId === id) this.sessionId = null;
            // Recovery re-indexes, which the demo tier may not do. A 404 there means
            // the backend restarted and lost the pinned sample; only a reload helps.
            if (this.demoMode)
              throw new Error(
                'The demo document is no longer loaded. Reload the page to start again.',
              );
            if (!recovered) {
              id = await this.recover(chunks, generation, controller.signal);
              response = await ask();
            }
          }
          this.current(generation, controller.signal);
          if (!response.ok) throw await this.rejected(response);
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
      // The demo's document is shared by every visitor and owned by nobody here, so
      // there is nothing to clean up -- and the backend would refuse the DELETE anyway.
      const id = this.demoMode ? null : this.sessionId;
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
