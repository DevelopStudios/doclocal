import { Component, input } from '@angular/core';

/**
 * Shown in place of the chat when the on-device model cannot run here.
 *
 * It replaces only the chat column. The document still renders beside it, because
 * parsing is pdf.js and needs no WebGPU -- someone on an unsupported browser can still
 * read and search their PDF, and blanking the viewer would take that away for no reason.
 *
 * The body text is passed in, never written here: `data-webllm`'s `loadFailureMessage`
 * already classified the failure and dropped the stack frames WebLLM's own text carries,
 * and it distinguishes "no WebGPU in this browser" from "not enough graphics memory".
 * A second copy of that wording here would drift from it.
 */
@Component({
  selector: 'app-webgpu-notice',
  standalone: true,
  templateUrl: './webgpu-notice.html',
  styleUrl: './webgpu-notice.scss',
})
export class WebgpuNotice {
  /** The sentence `data-webllm` wrote for this failure. */
  message = input.required<string>();
}
