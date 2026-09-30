import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';

// jsdom doesn't include the Web Streams API; polyfill from Node's built-in
if (typeof globalThis.ReadableStream === 'undefined') {
  (globalThis as unknown as Record<string, unknown>)['ReadableStream'] = NodeReadableStream;
}

setupZoneTestEnv({ errorOnUnknownElements: true, errorOnUnknownProperties: true });
