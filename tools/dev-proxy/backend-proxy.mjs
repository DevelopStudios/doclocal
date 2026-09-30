// Local dev proxy: the browser calls same-origin /api, and this Node process forwards to the
// loopback backend with the developer token. The token never reaches the browser or the bundle.

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX_TOKEN_LENGTH = 4096;

function fail(message) {
  throw new Error(`[doclocal dev proxy] ${message}`);
}

/** Validates DOCLOCAL_BACKEND_URL: plain http on a loopback host, no credentials, path or query. */
export function backendTarget(env) {
  const raw = (env.DOCLOCAL_BACKEND_URL ?? '').trim() || DEFAULT_BACKEND_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('DOCLOCAL_BACKEND_URL is not a valid URL.');
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname))
    fail('DOCLOCAL_BACKEND_URL must be http:// on 127.0.0.1, localhost or [::1].');
  if (url.username || url.password) fail('DOCLOCAL_BACKEND_URL must not contain credentials.');
  if (url.pathname !== '/' || url.search || url.hash)
    fail('DOCLOCAL_BACKEND_URL must be an origin only, e.g. http://127.0.0.1:8000.');
  return url.origin;
}

/** Validates DOCLOCAL_BACKEND_TOKEN. Error messages never include the value. */
export function backendToken(env) {
  const token = (env.DOCLOCAL_BACKEND_TOKEN ?? '').trim();
  if (!token)
    fail(
      'DOCLOCAL_BACKEND_TOKEN is not set. Export the raw developer token from ' +
        'scripts/new_dev_token.py before running npm start (see README).',
    );
  if (token.length > MAX_TOKEN_LENGTH || !/^[\x21-\x7e]+$/.test(token))
    fail('DOCLOCAL_BACKEND_TOKEN must be a single printable token without spaces or "Bearer".');
  if (/^[A-Za-z0-9._@-]+:[0-9a-f]{64}$/.test(token))
    fail(
      'DOCLOCAL_BACKEND_TOKEN looks like a DEV_ACCESS_TOKENS entry (developer:sha256). ' +
        'Use the raw token instead; only the backend stores the hash.',
    );
  return token;
}

/** Maps /api/... to /... on the backend; anything else is left for the matcher to reject. */
export function stripApiPrefix(path) {
  const rest = path.replace(/^\/api(?=[/?]|$)/, '');
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** Proxy hooks, exported separately so they can be tested without a dev server. */
export function attachProxyHandlers(proxy, token) {
  proxy.on('proxyReq', (proxyReq) => {
    // The browser holds no credentials for the backend; never forward any it sends.
    proxyReq.removeHeader('cookie');
    proxyReq.setHeader('authorization', `Bearer ${token}`);
  });
  proxy.on('proxyRes', (proxyRes) => {
    // The backend never redirects. Refuse to relay one rather than point the browser elsewhere.
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
      proxyRes.statusCode = 502;
      proxyRes.statusMessage = 'Bad Gateway';
      delete proxyRes.headers.location;
    }
  });
  proxy.on('error', (_error, _req, res) => {
    if (res && 'req' in res && !res.headersSent && !res.writableEnded) {
      res.writeHead(502, { 'Content-Type': 'text/plain' }).end('DocLocal backend is unreachable.');
    }
  });
}

/** Builds the Angular dev-server proxy config. Throws at startup when configuration is invalid. */
export function createBackendProxyConfig(env) {
  const target = backendTarget(env);
  const token = backendToken(env);
  return {
    '^/api(?=[/?]|$)': {
      target,
      changeOrigin: true,
      followRedirects: false,
      ws: false,
      xfwd: false,
      secure: true,
      rewrite: stripApiPrefix,
      configure: (proxy) => attachProxyHandlers(proxy, token),
    },
  };
}
