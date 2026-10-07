/**
 * The address a visitor asks for an account at.
 *
 * Three things about how this is written, all deliberate:
 *
 * 1. **Stored in parts, joined at call time.** The address never appears as a literal
 *    in the served HTML or the JavaScript bundle, and most harvesters do not execute
 *    JavaScript. `request-access.spec.ts` asserts the joined form appears nowhere in
 *    this directory's source.
 * 2. **One place.** A dedicated, burnable alias — never a primary address. If it
 *    leaks, rotating it is an edit to the array below and nothing else. Cheap recovery
 *    is the actual argument for using an alias at all.
 * 3. **No endpoint.** This is a `mailto:`, so there is nothing to inject into, nothing
 *    to rate-limit and nothing to deny service to, and no personal data about a
 *    requester ever reaches the server. Volume control is a mail filter on the alias,
 *    which is a mail problem rather than a web one.
 *
 * TODO: replace with the real alias before enabling the public demo. Until then the
 * button opens a mail client addressed nowhere useful.
 */
const PARTS = ['doclocal', '-', 'access', '@', 'example', '.', 'com'];

const SUBJECT = 'DocLocal access request';
const BODY = ['Who you are:', '', 'What you would like to try it on:', ''].join('\n');

export function accessAddress(): string {
  return PARTS.join('');
}

export function accessMailto(): string {
  const query = `subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;
  return `mailto:${accessAddress()}?${query}`;
}
