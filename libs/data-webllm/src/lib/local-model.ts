/**
 * The on-device model, and what to say when it cannot run.
 *
 * One model, not a ladder. #59 proposed choosing a rung from WebGPU adapter limits,
 * but `maxBufferSize` is a permission rather than a measurement -- the spec floor is
 * 256 MB whatever the hardware -- so a probe only guesses at what attempting the load
 * already answers. #56 measured the rung below this one, the 0.8B, returning no answer
 * at all for 2 of 3 questions and citing nothing, and it saves 616 MB of a download
 * that is multiple GB either way. So: load this, or say plainly why it could not.
 */
export const LOCAL_MODEL = 'Qwen3.5-2B-q4f16_1-MLC';

/** Rounded from the 2245 MB the WebLLM build reports, for reading rather than arithmetic. */
const LOCAL_MODEL_SIZE = '2.2 GB';

/** Sentinel for the one failure found before the worker is ever asked to load. */
export const NO_WEBGPU = 'no-webgpu';

/**
 * Whether this browser can run the model at all. Without WebGPU no size helps.
 * Takes `unknown` because the DOM's `Navigator` does not declare `gpu` without
 * `@webgpu/types`, and a structural parameter would reject the real navigator.
 */
export function webgpuUnavailable(nav: unknown): boolean {
  return !(nav as { gpu?: unknown } | undefined)?.gpu;
}

/**
 * A sentence for the reader. WebLLM's own failures carry paths and stack frames, so
 * the raw text classifies the failure and is then dropped rather than displayed.
 */
export function loadFailureMessage(raw: string): string {
  if (raw === NO_WEBGPU) {
    return 'This browser has no WebGPU, so the model cannot run on this device. Chrome or Edge 113 and later support it.';
  }
  if (/out of memory|oom|maxbuffersize|buffer size|allocat/i.test(raw)) {
    return `There is not enough graphics memory on this device for the ${LOCAL_MODEL_SIZE} model.`;
  }
  return 'The model could not be loaded. Reloading the page will try again.';
}
