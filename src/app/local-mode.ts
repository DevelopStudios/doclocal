/**
 * Whether this page runs the on-device answer path (`?local=1`) instead of the hosted
 * backend. A stop-gap entry point for issue #57: #60 replaces it with the real mode
 * chooser, and #59 decides from device capability rather than a query parameter.
 */
export function isLocalMode(): boolean {
  return new URLSearchParams(location.search).has('local');
}
