import {
  DOCUMENT,
  Injectable,
  InjectionToken,
  NgZone,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { resolveApiBaseUrl } from './api-url';

/**
 * Backend base URL for sign-in: `''` for the page's own origin (the dev server
 * proxies `/auth`), or an absolute HTTPS URL. Public configuration, never a secret.
 */
export const AUTH_API_BASE_URL = new InjectionToken<string>('AUTH_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '',
});

/** `fetch`, replaceable in tests. */
export const AUTH_FETCH = new InjectionToken<typeof fetch>('AUTH_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

/** How often a signed-in page asks the backend whether its sign-in is still valid. */
export const AUTH_REVALIDATE_INTERVAL_MS = new InjectionToken<number>(
  'AUTH_REVALIDATE_INTERVAL_MS',
  {
    providedIn: 'root',
    factory: () => 60_000,
  },
);

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in';

export interface AuthUser {
  /** This sign-in's own identity; one person may be signed in from several browsers. */
  id: string;
  username: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
// setTimeout holds a 32-bit delay; the backend caps a sign-in at 7 days anyway.
const MAX_TIMER_MS = 2_147_483_647;

export const SIGN_IN_MESSAGES = {
  invalid: 'Incorrect username or password.',
  unavailable: 'Sign-in is not available right now. Try again later.',
  unreachable: "Couldn't reach the sign-in service. Check your connection and try again.",
  expired: 'Your session has ended. Sign in again.',
} as const;

/**
 * The per-person username/password sign-in.
 *
 * The bearer token lives only in this object's memory: never in storage, cookies or
 * URLs, so reloading the page means signing in again. The session ends locally when
 * its lifetime runs out, and as soon as the backend answers 401 (signed out elsewhere,
 * password changed, backend restarted).
 */
@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly fetchFn = inject(AUTH_FETCH);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly revalidateMs = inject(AUTH_REVALIDATE_INTERVAL_MS);

  readonly status = signal<AuthStatus>('signed-out');
  readonly user = signal<AuthUser | null>(null);
  /** Why the last sign-in failed or the session ended; safe to display. */
  readonly error = signal<string | null>(null);
  /** Set when the backend URL is unusable; sign-in is then impossible. */
  readonly configError: string | null;

  /** Resolved backend base, without a trailing slash. API clients build paths on it
   * so every request reaches the same origin the sign-in was checked against. */
  readonly baseUrl: string;
  private token: string | null = null;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private revalidateTimer?: ReturnType<typeof setInterval>;
  private readonly onVisible = () => {
    if (this.document.visibilityState === 'visible') void this.revalidate();
  };

  constructor() {
    let baseUrl = '';
    let configError: string | null = null;
    try {
      baseUrl = resolveApiBaseUrl(inject(AUTH_API_BASE_URL), this.document.location);
    } catch (e) {
      configError = (e as Error).message;
    }
    this.baseUrl = baseUrl;
    this.configError = configError;
    this.document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('visibilitychange', this.onVisible);
    this.stopTimers();
  }

  /** Resolves true when signed in. The password is only passed through, never kept. */
  async login(username: string, password: string): Promise<boolean> {
    if (this.status() !== 'signed-out' || this.configError) return false;
    this.status.set('signing-in');
    this.error.set(null);
    let message: string = SIGN_IN_MESSAGES.unreachable;
    try {
      const response = await this.request('POST', '/auth/login', {
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const session = parseLogin(await response.json());
        if (session) {
          this.establish(session.token, session.user, session.expiresIn);
          return true;
        }
      } else {
        message = failureMessage(response);
      }
    } catch {
      // Network failure, timeout or a refused redirect: the default message applies.
    }
    this.status.set('signed-out');
    this.error.set(message);
    return false;
  }

  /** Signs out here at once, then asks the backend to revoke the token. */
  async logout(): Promise<void> {
    const token = this.token;
    this.clear(null);
    if (!token) return;
    try {
      await this.request('POST', '/auth/logout', { token });
    } catch {
      // Already signed out locally; the token still expires on the backend.
    }
  }

  /** Confirms the sign-in with the backend; a 401 signs out. Network errors don't. */
  async revalidate(): Promise<void> {
    const token = this.token;
    if (!token) return;
    try {
      const response = await this.request('GET', '/auth/me', { token });
      if (response.status === 401) this.handleUnauthorized(token);
    } catch {
      // Offline or unreachable: keep working until the local expiry.
    }
  }

  /** For API clients: the Authorization header value, or null when signed out. */
  authorizationHeader(): string | null {
    return this.token ? `Bearer ${this.token}` : null;
  }

  /** For API clients that got a 401 with the given token. */
  handleUnauthorized(token: string | null = this.token): void {
    if (token && token === this.token) this.clear(SIGN_IN_MESSAGES.expired);
  }

  private establish(token: string, user: AuthUser, expiresInS: number): void {
    this.token = token;
    this.user.set(user);
    this.status.set('signed-in');
    this.error.set(null);
    this.stopTimers();
    // Outside Angular: pending timers would otherwise keep the app from ever being stable.
    this.zone.runOutsideAngular(() => {
      this.expiryTimer = setTimeout(
        () => this.zone.run(() => this.handleUnauthorized(token)),
        Math.min(expiresInS * 1000, MAX_TIMER_MS),
      );
      this.revalidateTimer = setInterval(
        () => this.zone.run(() => void this.revalidate()),
        this.revalidateMs,
      );
    });
  }

  private clear(message: string | null): void {
    this.token = null;
    this.stopTimers();
    this.user.set(null);
    this.status.set('signed-out');
    this.error.set(message);
  }

  private stopTimers(): void {
    clearTimeout(this.expiryTimer);
    clearInterval(this.revalidateTimer);
    this.expiryTimer = this.revalidateTimer = undefined;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { token?: string; body?: string },
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body,
        mode: 'cors',
        // Bearer tokens only: no cookies either way, and credentials never follow a redirect.
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (response.redirected) throw new Error('Unexpected redirect');
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseLogin(body: unknown): { token: string; user: AuthUser; expiresIn: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { token, expiresIn, user } = body as Record<string, unknown>;
  if (typeof token !== 'string' || token === '') return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  if (typeof user !== 'object' || user === null) return null;
  const { id, username } = user as Record<string, unknown>;
  if (typeof id !== 'string' || typeof username !== 'string') return null;
  return { token, expiresIn, user: { id, username } };
}

function failureMessage(response: Response): string {
  if (response.status === 401 || response.status === 422) return SIGN_IN_MESSAGES.invalid;
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    return Number.isFinite(seconds) && seconds > 0
      ? `Too many sign-in attempts. Try again in ${Math.ceil(seconds)} seconds.`
      : 'Too many sign-in attempts. Try again shortly.';
  }
  if (response.status === 503) return SIGN_IN_MESSAGES.unavailable;
  return SIGN_IN_MESSAGES.unreachable;
}
