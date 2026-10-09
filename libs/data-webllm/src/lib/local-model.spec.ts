import { LOCAL_MODEL, loadFailureMessage, webgpuUnavailable } from './local-model';

describe('LOCAL_MODEL', () => {
  // #56 measured this rung as the first one presentable to a free user: the 0.8B
  // below it answered 2 of 3 questions not at all and cited nothing. Changing this
  // id is a product decision, so the test states it rather than reading it back.
  it('is the 2B rung', () => {
    expect(LOCAL_MODEL).toBe('Qwen3.5-2B-q4f16_1-MLC');
  });
});

describe('webgpuUnavailable', () => {
  it('is true when the navigator has no gpu at all', () => {
    expect(webgpuUnavailable({})).toBe(true);
  });

  it('is false when a gpu is present', () => {
    expect(webgpuUnavailable({ gpu: {} })).toBe(false);
  });

  it('is true for a navigator that is missing entirely', () => {
    expect(webgpuUnavailable(undefined)).toBe(true);
  });
});

describe('loadFailureMessage', () => {
  it('names WebGPU when that is what is missing', () => {
    const message = loadFailureMessage('no-webgpu');

    expect(message).toContain('WebGPU');
    expect(message).toContain('Chrome');
  });

  it('explains an out-of-memory failure as the device not fitting the model', () => {
    const message = loadFailureMessage('Error: out of memory while allocating buffer');

    expect(message).toMatch(/memory/i);
    expect(message).toContain('2.2 GB');
  });

  it('treats a buffer-size rejection as the same not-enough-room case', () => {
    const message = loadFailureMessage('requested maxBufferSize exceeds the limit');

    expect(message).toContain('2.2 GB');
  });

  it('falls back to a plain sentence for an unrecognised failure', () => {
    const message = loadFailureMessage('WebSocket 451 from the CDN');

    expect(message).toMatch(/could not be loaded/i);
  });

  // The raw text comes from WebLLM and can carry paths and stack frames; the panel
  // shows this string to whoever opened the page.
  it('never passes the raw failure through to the reader', () => {
    const message = loadFailureMessage('at /Users/someone/secret/path/engine.js:42:11');

    expect(message).not.toContain('/Users/');
    expect(message).not.toContain(':42:11');
  });
});
