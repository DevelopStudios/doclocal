import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '@doclocal/ui-kit';

/**
 * Everything the chat column is doing shows up here, in one control.
 *
 * `idle` is the only state that accepts a question. The other four are the same
 * control wearing what is happening: the placeholder says it in words, the send
 * button becomes a stop button whenever something is running, and `indexing`
 * also draws a progress rule along the bottom edge in `--color-busy`.
 *
 * Progress and "working on it" are never accent or evidence: accent means
 * clickable, evidence means citation, and neither is true of a spinner.
 */
export type ComposerState = 'idle' | 'indexing' | 'retrieving' | 'writing' | 'disabled';

@Component({
  selector: 'chat-composer',
  standalone: true,
  imports: [FormsModule, IconComponent],
  styles: [
    `
      .composer {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: flex-end;
        gap: 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-hairline);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        transition: border-color 0.15s;
      }
      /* Accent: the composer is something you type into. */
      .composer:focus-within {
        border-color: var(--color-accent);
      }
      textarea {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        color: var(--color-text);
        font-family: var(--font-sans);
        font-size: var(--text-ui);
        line-height: var(--leading-ui);
        max-height: 120px;
      }
      textarea::placeholder {
        color: var(--color-text-dim);
      }
      /* While something runs, the placeholder is the status line. */
      .composer--busy textarea::placeholder {
        color: var(--color-busy);
      }
      .composer--disabled textarea::placeholder {
        color: var(--color-text-dim);
      }

      .ctl {
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        padding: 0;
        border: none;
        border-radius: 50%;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition:
          background 0.15s,
          opacity 0.15s;
      }
      /* The ring is a box-shadow, not an outline: the composer clips its overflow
         so the progress rule can follow the rounded bottom edge. */
      .ctl:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--color-accent-soft);
      }
      .ctl--send {
        background: var(--color-accent);
        color: var(--color-accent-fg);
      }
      .ctl--send:hover:not(:disabled) {
        background: var(--color-accent-soft);
      }
      .ctl--send:disabled {
        opacity: 0.4;
        cursor: default;
      }
      /* Neutral, so stopping never reads as the primary action. */
      .ctl--stop {
        background: var(--color-surface-raised);
        color: var(--color-text);
      }
      .ctl--stop:hover:not(:disabled) {
        background: var(--color-hairline);
      }
      .ctl--stop:disabled {
        cursor: default;
      }
      .stop-glyph {
        display: block;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        background: currentColor;
      }

      .rule {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        background: var(--color-busy);
        transition: width 0.2s linear;
      }
      /* No number to show yet: sweep instead of sitting at zero. */
      .rule--indeterminate {
        width: 38%;
        animation: composer-rule 1.4s ease-in-out infinite;
      }
      @keyframes composer-rule {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(263%);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .rule--indeterminate {
          animation: none;
          width: 100%;
          opacity: 0.5;
        }
      }
    `,
  ],
  template: `
    <div
      class="composer"
      [class.composer--disabled]="blocked()"
      [class.composer--busy]="running()"
    >
      <textarea
        rows="1"
        [placeholder]="placeholder()"
        [disabled]="!accepting()"
        [attr.aria-disabled]="accepting() ? null : 'true'"
        [ngModel]="text()"
        (ngModelChange)="text.set($event)"
        (keydown)="onKeydown($event)"
      ></textarea>
      @if (running()) {
        <button
          type="button"
          class="ctl ctl--stop"
          aria-label="Stop generating"
          [disabled]="!stoppable()"
          [attr.aria-disabled]="stoppable() ? null : 'true'"
          (click)="stopped.emit()"
        >
          <span class="stop-glyph"></span>
        </button>
      } @else {
        <button
          type="button"
          class="ctl ctl--send"
          aria-label="Send question"
          [disabled]="!canSend()"
          [attr.aria-disabled]="canSend() ? null : 'true'"
          (click)="submit()"
        >
          <ui-icon name="send" [size]="14" />
        </button>
      }
      @if (state() === 'indexing') {
        <span
          class="rule"
          [class.rule--indeterminate]="progress() === null"
          [style.width.%]="progress() === null ? null : widthPercent()"
        ></span>
      }
    </div>
  `,
})
export class ComposerComponent {
  state = input<ComposerState>('idle');
  /** How many excerpts the retrieval came back with, for the `retrieving` placeholder. */
  excerptCount = input<number>(0);
  /** Indexing progress 0..1, or null when there is no number to show yet. */
  progress = input<number | null>(null);

  submitted = output<string>();
  stopped = output<void>();
  text = signal('');

  /** Something is running, so the send button is a stop button. */
  running = computed(() => {
    const state = this.state();
    return state === 'indexing' || state === 'retrieving' || state === 'writing';
  });

  /** The input is not taking a question: dimmed send, nothing to type into. */
  blocked = computed(() => this.state() === 'disabled' || this.state() === 'indexing');

  accepting = computed(() => this.state() === 'idle');

  canSend = computed(() => this.accepting() && this.text().trim().length > 0);

  /**
   * Only an answer in flight can be stopped from this column. Indexing is the
   * workspace's subscription -- replacing the document is what cancels it -- so the
   * stop button shows the state without claiming it can end it.
   */
  stoppable = computed(() => this.state() === 'retrieving' || this.state() === 'writing');

  widthPercent = computed(() => Math.max(0, Math.min(100, (this.progress() ?? 0) * 100)));

  placeholder = computed(() => {
    switch (this.state()) {
      case 'indexing':
        return 'Reading your document…';
      case 'retrieving': {
        const n = this.excerptCount();
        if (n <= 0) return 'Reading the excerpts…';
        return `Reading ${n} ${n === 1 ? 'excerpt' : 'excerpts'}…`;
      }
      case 'writing':
        return 'Writing the answer…';
      default:
        return 'Ask about the document…';
    }
  });

  submit() {
    const value = this.text().trim();
    if (!value || !this.accepting()) return;
    this.submitted.emit(value);
    this.text.set('');
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    }
  }
}
