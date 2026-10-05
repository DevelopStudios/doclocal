/** Where the page itself is served from; `window.location` in the app. */
export interface PageLocation {
  origin: string;
  protocol: string;
  hostname: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * The backend base URL that credentials may be sent to, without a trailing slash.
 *
 * `''` means the page's own origin, and a leading-slash value such as `/api` means
 * that prefix on the page's own origin — which is how local development reaches the
 * backend, through the dev server's single `/api` proxy rule. Anything else must be an
 * absolute URL, as in a deployment that calls the backend directly.
 *
 * Credentials only travel over HTTPS, or plain HTTP to this machine. A URL carrying
 * its own credentials, query or fragment is refused rather than silently altered.
 * Throws with a message safe to show when the configuration is unusable.
 */
export function resolveApiBaseUrl(configured: string, page: PageLocation): string {
  const raw = configured.trim();
  if (raw === '') {
    requireSafeTransport(page.protocol, page.hostname, 'This page');
    return page.origin;
  }
  if (raw.startsWith('/')) {
    if (raw.startsWith('//')) {
      throw new Error('The backend URL must not be protocol-relative.');
    }
    if (raw.includes('?') || raw.includes('#')) {
      throw new Error('The backend URL must not contain a query or fragment.');
    }
    requireSafeTransport(page.protocol, page.hostname, 'This page');
    return page.origin + raw.replace(/\/+$/, '');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The backend URL is not an absolute URL.');
  }
  if (url.username || url.password) {
    throw new Error('The backend URL must not contain credentials.');
  }
  if (raw.includes('?') || raw.includes('#')) {
    throw new Error('The backend URL must not contain a query or fragment.');
  }
  requireSafeTransport(url.protocol, url.hostname, 'The backend URL');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function requireSafeTransport(protocol: string, hostname: string, subject: string): void {
  if (protocol === 'https:') return;
  if (protocol === 'http:' && isLoopback(hostname)) return;
  throw new Error(`${subject} must use HTTPS (plain HTTP is allowed only for localhost).`);
}
