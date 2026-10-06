import { TestBed } from '@angular/core/testing';
import {
  AUTH_API_BASE_URL,
  AUTH_FETCH,
  AUTH_REVALIDATE_INTERVAL_MS,
  AuthService,
  SIGN_IN_MESSAGES,
} from './auth.service';

// Synthetic values only.
const TOKEN = 'synthetic-token-0123456789';
const PASSWORD = 'synthetic-passphrase-1';
const USER = { id: 'login-id-1', username: 'team' };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const loginOk = (expiresIn = 3600) =>
  json(200, { token: TOKEN, tokenType: 'Bearer', expiresAt: 'x', expiresIn, user: USER });

interface Call {
  url: string;
  init: RequestInit;
}

function setup(responses: Array<Response | Error>, baseUrl = 'https://api.example.test') {
  const calls: Call[] = [];
  const fetchFn = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? json(200, {});
    if (next instanceof Error) throw next;
    return next;
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: AUTH_FETCH, useValue: fetchFn },
      { provide: AUTH_API_BASE_URL, useValue: baseUrl },
      { provide: AUTH_REVALIDATE_INTERVAL_MS, useValue: 60_000 },
    ],
  });
  return { auth: TestBed.inject(AuthService), calls };
}

describe('AuthService', () => {
  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts signed out', () => {
    const { auth } = setup([]);

    expect(auth.status()).toBe('signed-out');
    expect(auth.user()).toBeNull();
    expect(auth.authorizationHeader()).toBeNull();
  });

  it('signs in with a safe credential request and keeps the token in memory only', async () => {
    const { auth, calls } = setup([loginOk()]);

    expect(await auth.login('team', PASSWORD)).toBe(true);

    expect(auth.status()).toBe('signed-in');
    expect(auth.user()).toEqual(USER);
    expect(auth.authorizationHeader()).toBe(`Bearer ${TOKEN}`);
    const [{ url, init }] = calls;
    expect(url).toBe('https://api.example.test/auth/login');
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
    expect(JSON.parse(init.body as string)).toEqual({ username: 'team', password: PASSWORD });
    expect(url).not.toContain(PASSWORD);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(TOKEN);
    expect(JSON.stringify(auth)).not.toContain(PASSWORD);
  });

  it.each([
    [json(401, { detail: 'Invalid username or password' }), SIGN_IN_MESSAGES.invalid],
    [json(422, { detail: [] }), SIGN_IN_MESSAGES.invalid],
    [json(503, {}), SIGN_IN_MESSAGES.unavailable],
    [json(500, {}), SIGN_IN_MESSAGES.unreachable],
    [json(429, {}, { 'Retry-After': '42' }), 'Too many sign-in attempts. Try again in 42 seconds.'],
    [new TypeError('Failed to fetch'), SIGN_IN_MESSAGES.unreachable],
    [json(200, { token: '', expiresIn: 60, user: USER }), SIGN_IN_MESSAGES.unreachable],
  ])('stays signed out on failure (%#)', async (response, message) => {
    const { auth } = setup([response]);

    expect(await auth.login('team', 'wrong-synthetic')).toBe(false);

    expect(auth.status()).toBe('signed-out');
    expect(auth.user()).toBeNull();
    expect(auth.authorizationHeader()).toBeNull();
    expect(auth.error()).toBe(message);
  });

  it('treats a redirected response as a failure', async () => {
    const redirected = { ...loginOk(), redirected: true } as Response;
    const { auth } = setup([redirected]);

    expect(await auth.login('team', PASSWORD)).toBe(false);
    expect(auth.status()).toBe('signed-out');
  });

  it('refuses to send credentials to an unsafe backend URL', async () => {
    const { auth, calls } = setup([loginOk()], 'http://api.example.test');

    expect(auth.configError).toMatch(/HTTPS/);
    expect(await auth.login('team', PASSWORD)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('signs out when the session expires', async () => {
    jest.useFakeTimers();
    const { auth } = setup([loginOk(120)]);
    await auth.login('team', PASSWORD);

    jest.advanceTimersByTime(119_999);
    expect(auth.status()).toBe('signed-in');
    jest.advanceTimersByTime(1);

    expect(auth.status()).toBe('signed-out');
    expect(auth.authorizationHeader()).toBeNull();
    expect(auth.error()).toBe(SIGN_IN_MESSAGES.expired);
  });

  it('signs out when the backend answers 401 to a periodic check', async () => {
    jest.useFakeTimers();
    const { auth, calls } = setup([loginOk(), json(200, {}), json(401, {})]);
    await auth.login('team', PASSWORD);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(auth.status()).toBe('signed-in');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(calls[1].url).toBe('https://api.example.test/auth/me');
    expect((calls[1].init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(auth.status()).toBe('signed-out');
    expect(auth.error()).toBe(SIGN_IN_MESSAGES.expired);
  });

  it('stays signed in when a check fails for network reasons', async () => {
    const { auth } = setup([loginOk(), new TypeError('offline')]);
    await auth.login('team', PASSWORD);

    await auth.revalidate();

    expect(auth.status()).toBe('signed-in');
  });

  it('checks again when the tab becomes visible', async () => {
    const { auth, calls } = setup([loginOk(), json(401, {})]);
    await auth.login('team', PASSWORD);

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.map((c) => c.url)).toContain('https://api.example.test/auth/me');
    expect(auth.status()).toBe('signed-out');
  });

  it('logout clears local state at once and revokes the token', async () => {
    const { auth, calls } = setup([loginOk(), json(204, null)]);
    await auth.login('team', PASSWORD);

    const done = auth.logout();
    expect(auth.status()).toBe('signed-out');
    expect(auth.authorizationHeader()).toBeNull();
    await done;

    expect(calls[1].url).toBe('https://api.example.test/auth/logout');
    expect((calls[1].init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(auth.error()).toBeNull();
  });

  it('logout still signs out locally when the backend is unreachable', async () => {
    const { auth } = setup([loginOk(), new TypeError('offline')]);
    await auth.login('team', PASSWORD);

    await auth.logout();

    expect(auth.status()).toBe('signed-out');
  });

  it('ignores a 401 for a token from an earlier sign-in', async () => {
    const { auth } = setup([loginOk()]);
    await auth.login('team', PASSWORD);

    auth.handleUnauthorized('some-older-token');

    expect(auth.status()).toBe('signed-in');
  });

  it('stops its timers after logout', async () => {
    jest.useFakeTimers();
    const { auth, calls } = setup([loginOk(), json(204, null)]);
    await auth.login('team', PASSWORD);
    await auth.logout();

    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(calls).toHaveLength(2);
  });
});
