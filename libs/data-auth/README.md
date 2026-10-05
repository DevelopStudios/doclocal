# data-auth

The shared username/password sign-in against the DocLocal backend (`/auth/login`,
`/auth/me`, `/auth/logout`). UI-agnostic: the app renders the form and gates the
workspace on `AuthService.status()`.

- The bearer token is held in memory only (no storage, cookies or URLs); reloading
  the page means signing in again. There is no "remember me".
- The session ends locally at its expiry, when the backend answers 401 (checked
  every minute and whenever the tab becomes visible), or on sign-out.
- Requests go only to the URL from `AUTH_API_BASE_URL`, validated by
  `resolveApiBaseUrl`: HTTPS, or HTTP to localhost; no credentials, query or
  fragment; redirects are refused and cookies are never sent.

Run `nx test data-auth` to execute the unit tests.
