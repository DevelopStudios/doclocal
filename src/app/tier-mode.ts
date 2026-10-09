import { InjectionToken } from '@angular/core';

/**
 * DocLocal answers on the device by default: the document is parsed, indexed and answered
 * in the browser, nothing is uploaded, and no account is needed.
 *
 * `?hosted=1` opts into the NVIDIA NIM backend instead, which needs a sign-in and sends
 * the document's text off the machine. That path is kept working but is no longer the
 * default; #59/#60/#61 turn this into a real choice driven by device capability.
 */
export function isHostedMode(): boolean {
  return new URLSearchParams(location.search).has('hosted');
}

/**
 * Injectable form of {@link isHostedMode}, so components can be tested in either mode
 * without reaching for the real URL.
 */
export const HOSTED_MODE = new InjectionToken<boolean>('HOSTED_MODE', {
  providedIn: 'root',
  factory: () => isHostedMode(),
});
