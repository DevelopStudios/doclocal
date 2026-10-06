// Run with: npm run test:proxy
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { after, before, describe, it } from 'node:test';
import { createServer } from 'vite';
import {
  attachProxyHandlers,
  backendTarget,
  backendToken,
  createBackendProxyConfig,
  DEFAULT_BACKEND_URL,
  stripApiPrefix,
} from './backend-proxy.mjs';

const TOKEN = 'synthetic-test-token_123';

/** Runs the proxyReq hook against a stand-in request and reports the headers it set. */
function forwardHeaders(token, incoming = {}) {
  const headers = { ...incoming };
  const proxyReq = {
    getHeader: (name) => headers[name.toLowerCase()],
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    removeHeader: (name) => delete headers[name.toLowerCase()],
  };
  const handlers = {};
  attachProxyHandlers({ on: (event, fn) => (handlers[event] = fn) }, token);
  handlers.proxyReq(proxyReq);
  return headers;
}

describe('attachProxyHandlers', () => {
  it('keeps the header the browser signed in with', () => {
    const headers = forwardHeaders(TOKEN, { authorization: 'Bearer mine' });
    assert.equal(headers.authorization, 'Bearer mine');
  });

  it('adds the developer token when the request has no header of its own', () => {
    assert.equal(forwardHeaders(TOKEN).authorization, `Bearer ${TOKEN}`);
  });

  it('invents no credential when no token is configured', () => {
    // The backend must answer 401 and the app must show its sign-in, rather than the
    // proxy quietly granting access nobody authenticated for.
    assert.equal(forwardHeaders(null).authorization, undefined);
  });

  it('always strips cookies', () => {
    assert.equal(forwardHeaders(null, { cookie: 'sid=1' }).cookie, undefined);
  });
});

describe('backendTarget', () => {
  it('defaults to the loopback backend', () => {
    assert.equal(backendTarget({}), DEFAULT_BACKEND_URL);
  });

  it('accepts loopback hosts', () => {
    for (const url of ['http://localhost:9000', 'http://127.0.0.1:8001/', 'http://[::1]:8000'])
      assert.doesNotThrow(() => backendTarget({ DOCLOCAL_BACKEND_URL: url }));
  });

  it('rejects remote, https, credential, path and malformed targets', () => {
    for (const url of [
      'http://example.com:8000',
      'http://192.168.1.5:8000',
      'https://localhost:8000',
      'http://user:pass@127.0.0.1:8000',
      'http://127.0.0.1:8000/v1',
      'http://127.0.0.1:8000/?x=1',
      'not a url',
    ])
      assert.throws(() => backendTarget({ DOCLOCAL_BACKEND_URL: url }), /DOCLOCAL_BACKEND_URL/);
  });
});

describe('backendToken', () => {
  it('is optional, because the browser brings its own token from signing in', () => {
    assert.equal(backendToken({}), null);
    assert.equal(backendToken({ DOCLOCAL_BACKEND_TOKEN: '  ' }), null);
  });

  it('rejects header-unsafe values without echoing them', () => {
    for (const value of ['Bearer abc', 'abc\r\nX-Evil: 1', 'a'.repeat(5000)]) {
      assert.throws(
        () => backendToken({ DOCLOCAL_BACKEND_TOKEN: value }),
        (error) => !error.message.includes(value) && /printable/.test(error.message),
      );
    }
  });

  it('rejects the hashed DEV_ACCESS_TOKENS entry', () => {
    const entry = `local:${'a'.repeat(64)}`;
    assert.throws(() => backendToken({ DOCLOCAL_BACKEND_TOKEN: entry }), /raw token/);
  });

  it('trims surrounding whitespace', () => {
    assert.equal(backendToken({ DOCLOCAL_BACKEND_TOKEN: ` ${TOKEN}\n` }), TOKEN);
  });
});

describe('stripApiPrefix', () => {
  it('removes only the /api segment', () => {
    assert.equal(stripApiPrefix('/api/sessions'), '/sessions');
    assert.equal(stripApiPrefix('/api/sessions/abc?x=1'), '/sessions/abc?x=1');
    assert.equal(stripApiPrefix('/api'), '/');
    assert.equal(stripApiPrefix('/api?x=1'), '/?x=1');
  });
});

describe('createBackendProxyConfig', () => {
  it('starts without a token, so npm start works before anyone has signed in', () => {
    assert.ok(createBackendProxyConfig({})['^/api(?=[/?]|$)']);
  });

  it('never exposes the token in serialisable config', () => {
    const config = createBackendProxyConfig({ DOCLOCAL_BACKEND_TOKEN: TOKEN });
    assert.ok(!JSON.stringify(config).includes(TOKEN));
  });
});

describe('dev proxy (Vite) against a fake backend', () => {
  let backend;
  let vite;
  let base;
  const seen = [];

  before(async () => {
    backend = http.createServer((req, res) => {
      seen.push({ url: req.url, headers: req.headers });
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: 'http://example.com/steal' }).end();
      } else if (req.url === '/chat') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('event: token\ndata: {"token":"hi"}\n\n');
        res.end('event: done\ndata: {}\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      }
    });
    await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const proxy = createBackendProxyConfig({
      DOCLOCAL_BACKEND_URL: `http://127.0.0.1:${backend.address().port}`,
      DOCLOCAL_BACKEND_TOKEN: TOKEN,
    });
    vite = await createServer({
      configFile: false,
      root: os.tmpdir(),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, proxy, watch: null },
    });
    await vite.listen();
    base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  });

  after(async () => {
    await vite?.close();
    await new Promise((resolve) => backend?.close(resolve));
  });

  it("strips /api and forwards the browser's own sign-in token untouched", async () => {
    const response = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer from-browser', Cookie: 'sid=1' },
    });
    assert.equal(response.status, 200);
    const request = seen.at(-1);
    assert.equal(request.url, '/sessions');
    // Overwriting this would authenticate the browser as the developer whether or not
    // anyone signed in, which would make the sign-in untestable locally.
    assert.equal(request.headers.authorization, 'Bearer from-browser');
    assert.equal(request.headers.cookie, undefined);
  });

  it('falls back to the developer token only when the request carries none', async () => {
    const response = await fetch(`${base}/api/sessions`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(seen.at(-1).headers.authorization, `Bearer ${TOKEN}`);
  });

  it('streams SSE through unchanged', async () => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST' });
    assert.equal(
      await response.text(),
      'event: token\ndata: {"token":"hi"}\n\nevent: done\ndata: {}\n\n',
    );
  });

  it('does not follow or relay upstream redirects', async () => {
    const response = await fetch(`${base}/api/redirect`, { redirect: 'manual' });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
    assert.equal(seen.filter((r) => r.url === '/steal').length, 0);
  });

  it('does not proxy paths outside /api', async () => {
    const before = seen.length;
    await fetch(`${base}/apifoo`);
    await fetch(`${base}/sessions`);
    assert.equal(seen.length, before);
  });

  it('returns 502 when the backend is down', async () => {
    const closed = http.createServer();
    await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = closed.address().port;
    await new Promise((resolve) => closed.close(resolve));
    const down = await createServer({
      configFile: false,
      root: os.tmpdir(),
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: 0,
        watch: null,
        proxy: createBackendProxyConfig({
          DOCLOCAL_BACKEND_URL: `http://127.0.0.1:${port}`,
          DOCLOCAL_BACKEND_TOKEN: TOKEN,
        }),
      },
    });
    await down.listen();
    try {
      const response = await fetch(
        `http://127.0.0.1:${down.httpServer.address().port}/api/sessions`,
        { method: 'POST' },
      );
      assert.equal(response.status, 502);
      assert.ok(!(await response.text()).includes(TOKEN));
    } finally {
      await down.close();
    }
  });
});
