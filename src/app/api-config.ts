// Set per build configuration by the `define` option in project.json: the backend the
// app signs in to and calls. '/api' means that prefix on this page's own origin, which
// the dev server proxies to a local backend (proxy.conf.mjs). Public configuration,
// never a secret -- no token is ever built into the bundle.
declare const DOCLOCAL_API_BASE_URL: string | undefined;

// Test builds don't apply `define`, so fall back to the page's origin there.
export const apiBaseUrl = typeof DOCLOCAL_API_BASE_URL === 'string' ? DOCLOCAL_API_BASE_URL : '';
