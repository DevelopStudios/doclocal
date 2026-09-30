# NIM backend adapter

`BackendService` calls the same-origin `/api` endpoint for session creation, chunk indexing,
streamed chat and session deletion. It does not handle or persist credentials. Its observables
abort active requests on unsubscribe, guard document replacement races and recover once from
an expired session using the currently indexed chunks.

`tools/dev-proxy/backend-proxy.mjs` provides a loopback-only development proxy. The Node
process reads `DOCLOCAL_BACKEND_TOKEN` and optional `DOCLOCAL_BACKEND_URL` (default
`http://127.0.0.1:8000`). It strips `/api`, injects the backend bearer token and refuses redirects.
No provider key or backend token belongs in browser configuration.

The dependent NIM frontend migration activates `proxy.conf.mjs` in the Angular serve target and
connects the UI. This infrastructure change alone does not change the app's inference mode.

Validation: `npx nx test data-backend --runInBand` and `npm run test:proxy`.
