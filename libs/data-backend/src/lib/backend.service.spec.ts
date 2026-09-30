import { lastValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { BackendService } from './backend.service';
import type { BackendChatEvent } from './backend.service';

function sseBody(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = frames.map((f) => encoder.encode(f));
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

describe('BackendService', () => {
  let service: BackendService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as unknown as Record<string, unknown>)['fetch'] = fetchMock;
    TestBed.configureTestingModule({});
    service = TestBed.inject(BackendService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('indexDocument$', () => {
    it('POSTs same-origin /api/sessions then /api/documents/index', (done) => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sessionId: 'sess-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ indexed: 1 }),
        });

      const chunks = [{ id: 'c0', text: 'hello', pageNumber: 1, startWord: 0 }];
      service.indexDocument$(chunks).subscribe({
        complete: () => {
          expect(fetchMock).toHaveBeenCalledTimes(2);
          const [sessCall, idxCall] = fetchMock.mock.calls as [
            [string, RequestInit],
            [string, RequestInit],
          ];
          expect(sessCall[0]).toBe('/api/sessions');
          expect(idxCall[0]).toBe('/api/documents/index');
          const body = JSON.parse(idxCall[1].body as string);
          expect(body.session_id).toBe('sess-1');
          expect(body.chunks[0].start_word).toBe(0);
          done();
        },
        error: done,
      });
    });

    it('reuses existing session on second call', (done) => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sessionId: 'sess-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ indexed: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ indexed: 1 }),
        });

      const chunks = [{ id: 'c0', text: 'hi', pageNumber: 1, startWord: 0 }];
      service.indexDocument$(chunks).subscribe({
        complete: () => {
          service.indexDocument$(chunks).subscribe({
            complete: () => {
              expect(fetchMock).toHaveBeenCalledTimes(3); // no second /sessions
              done();
            },
            error: done,
          });
        },
        error: done,
      });
    });
  });

  describe('chat$', () => {
    it('emits citations, tokens, and done from SSE stream', (done) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sessionId: 's1' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ indexed: 0 }),
      });

      service.indexDocument$([]).subscribe({
        complete: () => {
          fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            body: sseBody(
              'event: citations\ndata: {"citations":[]}\n\n',
              'event: token\ndata: {"token":"hi"}\n\n',
              'event: done\ndata: {}\n\n',
            ),
          });

          const events: BackendChatEvent[] = [];
          service.chat$('hello?').subscribe({
            next: (e) => events.push(e),
            complete: () => {
              expect(events).toHaveLength(3);
              expect(events[0].type).toBe('citations');
              expect(events[1].type).toBe('token');
              expect((events[1] as { type: 'token'; token: string }).token).toBe('hi');
              expect(events[2].type).toBe('done');
              done();
            },
            error: done,
          });
        },
        error: done,
      });
    });

    it('recreates session and re-indexes on 404 then retries chat', (done) => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sessionId: 's1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ indexed: 1 }),
        });

      const chunks = [{ id: 'c0', text: 'hi', pageNumber: 1, startWord: 0 }];
      service.indexDocument$(chunks).subscribe({
        complete: () => {
          fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: async () => ({ detail: 'not found' }),
          });
          fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => ({ sessionId: 's2' }),
          });
          fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ indexed: 1 }),
          });
          fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            body: sseBody('event: citations\ndata: {"citations":[]}\n\nevent: done\ndata: {}\n\n'),
          });

          service.chat$('Q?').subscribe({
            complete: () => {
              expect(fetchMock.mock.calls.length).toBe(6);
              done();
            },
            error: done,
          });
        },
        error: done,
      });
    });

    it('errors the observable on non-404 HTTP error', (done) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sessionId: 's1' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ indexed: 0 }),
      });

      service.indexDocument$([]).subscribe({
        complete: () => {
          fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({ detail: 'unavailable' }),
          });
          service.chat$('Q?').subscribe({
            error: (e: Error) => {
              expect(e.message).toMatch(/503/);
              done();
            },
            complete: () => done(new Error('should not complete')),
          });
        },
        error: done,
      });
    });

    it('aborts the fetch when the subscription is unsubscribed', (done) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sessionId: 's1' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ indexed: 0 }),
      });

      service.indexDocument$([]).subscribe({
        complete: () => {
          let capturedSignal: AbortSignal | undefined;
          const neverEndingBody = new ReadableStream({
            start() {
              /* never closes */
            },
          });
          fetchMock.mockImplementationOnce((_url: string, opts: RequestInit) => {
            capturedSignal = opts.signal as AbortSignal;
            return Promise.resolve({ ok: true, status: 200, body: neverEndingBody });
          });

          const sub = service.chat$('Q?').subscribe({ error: () => undefined });
          setTimeout(() => {
            sub.unsubscribe();
            expect(capturedSignal?.aborted).toBe(true);
            done();
          }, 50);
        },
        error: done,
      });
    });

    it('errors when stream closes without a terminal event', (done) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sessionId: 's1' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ indexed: 0 }),
      });

      service.indexDocument$([]).subscribe({
        complete: () => {
          // Body closes after some tokens, no done/error event
          fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            body: sseBody('event: token\ndata: {"token":"hi"}\n\n'),
          });
          service.chat$('Q?').subscribe({
            error: (e: Error) => {
              expect(e.message).toMatch(/terminal/i);
              done();
            },
            complete: () => done(new Error('should not complete')),
          });
        },
        error: done,
      });
    });
  });

  describe('deleteSession$', () => {
    it('sends DELETE /api/sessions/{id} without browser credentials', (done) => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sessionId: 'sess-del' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ indexed: 0 }),
        })
        .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });

      service.indexDocument$([]).subscribe({
        complete: () => {
          service.deleteSession$().subscribe({
            complete: () => {
              const delCall = fetchMock.mock.calls[2] as [string, RequestInit];
              expect(delCall[0]).toBe('/api/sessions/sess-del');
              expect(delCall[1].method).toBe('DELETE');
              const headers = delCall[1].headers as Record<string, string>;
              expect(headers).toBeUndefined();
              done();
            },
            error: done,
          });
        },
        error: done,
      });
    });

    it('completes without error when no session exists', (done) => {
      service.deleteSession$().subscribe({ complete: done, error: done });
    });
  });
  it('aborts a pending session creation and suppresses stale indexing', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const sub = service.indexDocument$([]).subscribe();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    sub.unsubscribe();
    expect(signal.aborted).toBe(true);
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    resolve({ ok: true, status: 201, json: async () => ({ sessionId: 'late' }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.some((c) => c[0].endsWith('/documents/index'))).toBe(false);
    expect(service.sessionStatus()).not.toBe('ready');
  });

  it('recovers once when an existing session expires during indexing', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'old' }) })
      .mockResolvedValueOnce({ ok: true });
    await lastValueFrom(service.indexDocument$([]));
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'new' }) })
      .mockResolvedValueOnce({ ok: true });
    await lastValueFrom(service.indexDocument$([]));
    expect(service.sessionStatus()).toBe('ready');
    expect(fetchMock.mock.calls).toHaveLength(5);
  });

  it('late deletion cannot clear the replacement session', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'old' }) })
      .mockResolvedValueOnce({ ok: true });
    await lastValueFrom(service.indexDocument$([]));
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const deletion = new Promise<void>((res, rej) =>
      service.deleteSession$().subscribe({ complete: res, error: rej }),
    );
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'new' }) })
      .mockResolvedValueOnce({ ok: true });
    await lastValueFrom(service.indexDocument$([]));
    resolve({ ok: true, status: 204 });
    await deletion;
    fetchMock.mockResolvedValueOnce({ ok: true, body: sseBody('event: done\ndata: {}\n\n') });
    await lastValueFrom(service.chat$('q'));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).session_id).toBe('new');
  });

  describe('same-origin security', () => {
    const ready = async (id = 's1'): Promise<void> => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: id }) })
        .mockResolvedValueOnce({ ok: true });
      await lastValueFrom(service.indexDocument$([]));
    };

    it('exposes no token or URL configuration API', () => {
      for (const name of ['setConfig', 'clearConfig', 'validateUrl', 'configured'])
        expect((service as unknown as Record<string, unknown>)[name]).toBeUndefined();
    });

    it('sends every request to /api without Authorization and refuses redirects', async () => {
      await ready();
      fetchMock.mockResolvedValueOnce({ ok: true, body: sseBody('event: done\ndata: {}\n\n') });
      await lastValueFrom(service.chat$('q'));
      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
      await lastValueFrom(service.deleteSession$(), { defaultValue: undefined });
      expect(fetchMock.mock.calls).toHaveLength(4);
      for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
        expect(url.startsWith('/api/')).toBe(true);
        expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization/i);
        expect(init.redirect).toBe('error');
        expect(init.credentials).toBe('same-origin');
      }
    });

    it('explains a 401 in terms of the proxy token', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(lastValueFrom(service.indexDocument$([]))).rejects.toThrow(
        /DOCLOCAL_BACKEND_TOKEN/,
      );
      expect(service.sessionStatus()).toBe('error');
      expect(service.sessionError()).toMatch(/401/);
    });
  });

  describe('chat$ stream handling', () => {
    beforeEach(async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's1' }) })
        .mockResolvedValueOnce({ ok: true });
      await lastValueFrom(
        service.indexDocument$([{ id: 'c0', text: 't', pageNumber: 2, startWord: 5 }]),
      );
    });

    const collect = (question = 'q'): Promise<BackendChatEvent[]> =>
      new Promise((resolve, reject) => {
        const events: BackendChatEvent[] = [];
        service.chat$(question).subscribe({
          next: (e) => events.push(e),
          complete: () => resolve(events),
          error: reject,
        });
      });

    it('decodes frames split across network chunks and passes citations through', async () => {
      const frame =
        'event: citations\ndata: {"citations":[{"chunkId":"c0","text":"t","pageNumber":2,"startWord":5,"score":0.9}]}\n\n' +
        'event: token\ndata: {"token":"A [1]"}\n\nevent: done\ndata: {"finishReason":"length"}\n\n';
      const parts = [frame.slice(0, 17), frame.slice(17, 90), frame.slice(90)];
      fetchMock.mockResolvedValueOnce({ ok: true, body: sseBody(...parts) });
      const events = await collect();
      expect(events).toEqual([
        {
          type: 'citations',
          citations: [{ chunkId: 'c0', text: 't', pageNumber: 2, startWord: 5, score: 0.9 }],
        },
        { type: 'token', token: 'A [1]' },
        { type: 'done', finishReason: 'length' },
      ]);
    });

    it('emits a terminal error event with code and retryable flag', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: sseBody(
          'event: token\ndata: {"token":"part"}\n\n',
          'event: error\ndata: {"message":"NIM failed","code":"upstream","retryable":true}\n\n',
        ),
      });
      const events = await collect();
      expect(events.at(-1)).toEqual({
        type: 'error',
        message: 'NIM failed',
        code: 'upstream',
        retryable: true,
      });
    });

    it('ignores unknown events and rejects malformed tokens', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: sseBody('event: ping\ndata: {}\n\n', 'event: token\ndata: {"token":1}\n\n'),
      });
      await expect(collect()).rejects.toThrow(/Invalid backend token/);
    });

    it('recovers from a 404 at most once', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's2' }) })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(collect()).rejects.toThrow(/404/);
      expect(fetchMock.mock.calls).toHaveLength(6);
      const reindex = JSON.parse(fetchMock.mock.calls[4][1].body);
      expect(reindex).toEqual({
        session_id: 's2',
        chunks: [{ id: 'c0', text: 't', page_number: 2, start_word: 5 }],
      });
    });

    describe('expired-session recovery', () => {
      const deferred = (): { promise: Promise<unknown>; resolve: (v: unknown) => void } => {
        let resolve!: (v: unknown) => void;
        const promise = new Promise((r) => (resolve = r));
        return { promise, resolve };
      };
      const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
      const calls = (): [string, RequestInit][] => fetchMock.mock.calls as [string, RequestInit][];
      const deletes = (): string[] =>
        calls()
          .filter(([, init]) => init?.method === 'DELETE')
          .map(([url]) => url);
      const lastChatSession = (): unknown =>
        JSON.parse(
          calls()
            .filter(([url]) => url === '/api/chat')
            .at(-1)?.[1].body as string,
        ).session_id;
      const recoverThenAnswer = (id: string): void => {
        fetchMock
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: id }) })
          .mockResolvedValueOnce({ ok: true })
          .mockResolvedValueOnce({ ok: true, body: sseBody('event: done\ndata: {}\n\n') });
      };

      it('deletes the orphan and re-runs recovery when Stop cancels recovery indexing', async () => {
        const indexing = deferred();
        fetchMock
          .mockResolvedValueOnce({ ok: false, status: 404 })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's2' }) })
          .mockImplementationOnce(() => indexing.promise);
        const sub = service.chat$('q').subscribe({ error: () => undefined });
        await tick();
        sub.unsubscribe();
        fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
        indexing.resolve({ ok: true });
        await tick();
        expect(deletes()).toEqual(['/api/sessions/s2']);
        expect(service.sessionStatus()).toBe('ready');

        recoverThenAnswer('s3');
        await collect();
        expect(lastChatSession()).toBe('s3');
        expect(calls().some(([url, init]) => url === '/api/chat' && !init.body)).toBe(false);
      });

      it('never chats against a recovered session whose indexing was cancelled', async () => {
        const indexing = deferred();
        fetchMock
          .mockResolvedValueOnce({ ok: false, status: 404 })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's2' }) })
          .mockImplementationOnce(() => indexing.promise);
        const sub = service.chat$('q').subscribe({ error: () => undefined });
        await tick();
        sub.unsubscribe();
        // Ask again before the cancelled index request settles.
        recoverThenAnswer('s3');
        await collect();
        expect(lastChatSession()).toBe('s3');
        fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
        indexing.resolve({ ok: true });
        await tick();
        expect(deletes()).toEqual(['/api/sessions/s2']);
      });

      it('reports a failed recovery clearly, deletes the orphan, and allows retry', async () => {
        fetchMock
          .mockResolvedValueOnce({ ok: false, status: 404 })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's2' }) })
          .mockResolvedValueOnce({ ok: false, status: 503 })
          .mockResolvedValueOnce({ ok: true, status: 204 });
        await expect(collect()).rejects.toThrow(/expired.*503.*ask again.*replace the document/is);
        await tick();
        expect(deletes()).toEqual(['/api/sessions/s2']);
        expect(service.sessionStatus()).toBe('ready');

        recoverThenAnswer('s3');
        await collect();
        expect(lastChatSession()).toBe('s3');
      });

      it('replacement racing recovery keeps the new session and deletes only the orphan', async () => {
        const indexing = deferred();
        fetchMock
          .mockResolvedValueOnce({ ok: false, status: 404 })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'orphan' }) })
          .mockImplementationOnce(() => indexing.promise);
        const error = jest.fn();
        service.chat$('q').subscribe({ error });
        await tick();

        // Replace the document. The expired session was already detached, so nothing to DELETE.
        await lastValueFrom(service.deleteSession$(), { defaultValue: undefined });
        fetchMock
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'new' }) })
          .mockResolvedValueOnce({ ok: true });
        await lastValueFrom(service.indexDocument$([]));

        fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
        indexing.resolve({ ok: true });
        await tick();
        expect(error).not.toHaveBeenCalled();
        expect(deletes()).toEqual(['/api/sessions/orphan']);
        expect(service.sessionStatus()).toBe('ready');

        fetchMock.mockResolvedValueOnce({ ok: true, body: sseBody('event: done\ndata: {}\n\n') });
        await collect();
        expect(lastChatSession()).toBe('new');
      });
    });

    it('drops a stream silently once the document is replaced', async () => {
      let push!: (text: string) => void;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (text) => controller.enqueue(new TextEncoder().encode(text));
        },
      });
      fetchMock.mockResolvedValueOnce({ ok: true, body });
      const next = jest.fn();
      const error = jest.fn();
      service.chat$('q').subscribe({ next, error });
      await new Promise((r) => setTimeout(r, 0));
      service.clearSession();
      push('event: token\ndata: {"token":"late"}\n\n');
      await new Promise((r) => setTimeout(r, 0));
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('bounds an unterminated frame', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: sseBody(`event: token\ndata: ${'x'.repeat(300000)}`),
      });
      await expect(collect()).rejects.toThrow(/limit/);
    });
  });

  it('deletes a session created after the operation was cancelled', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const sub = service.indexDocument$([]).subscribe();
    sub.unsubscribe();
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    resolve({ ok: true, status: 201, json: async () => ({ sessionId: 'orphan' }) });
    await new Promise((r) => setTimeout(r, 0));
    const deletion = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(deletion?.[0]).toBe('/api/sessions/orphan');
  });
});
