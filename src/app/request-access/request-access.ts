import { Component, input, signal } from '@angular/core';
import { accessAddress, accessMailto } from './access-address';

/**
 * "Ask for an account" — a mail client, not a form.
 *
 * Accounts are issued by hand, so a form would buy nothing: with the demo live,
 * anyone who bothers to ask has already used the product and wants their own files.
 * A `mailto:` keeps the no-persistent-storage claim literally true, because nothing
 * about a requester touches the server at all.
 *
 * The address is assembled only when the dialog opens (see `access-address.ts`), and
 * this component is only mounted after a visitor has seen an answer.
 */
@Component({
  selector: 'app-request-access',
  standalone: true,
  styles: [
    `
      .invite {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 13px;
        color: var(--color-text-muted);
      }
      /* Under the demo's three panes: a full-width footer bar. */
      .invite--bar {
        padding: 10px 16px;
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      .open-btn {
        background: var(--color-accent);
        color: var(--color-accent-fg);
        border: none;
        border-radius: var(--radius-sm);
        padding: 6px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      .open-btn:hover {
        opacity: 0.85;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgb(0 0 0 / 55%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        z-index: 20;
      }
      .card {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        max-width: 420px;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .card h2 {
        margin: 0;
        font-size: 16px;
        color: var(--color-text);
      }
      .card p {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
      .address-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .address {
        flex: 1;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 6px 8px;
        overflow-wrap: anywhere;
      }
      .ghost-btn {
        background: transparent;
        color: var(--color-text-muted);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .ghost-btn:hover {
        color: var(--color-text);
        border-color: var(--color-accent);
      }
      .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
    `,
  ],
  template: `
    <div class="invite" [class.invite--bar]="variant() === 'bar'">
      <span>Want to ask about your own documents?</span>
      <button class="open-btn" type="button" (click)="open()">Request access</button>
    </div>

    @if (showing()) {
      <div class="backdrop" (click)="close()">
        <div
          class="card"
          role="dialog"
          aria-modal="true"
          aria-label="Request access"
          (click)="$event.stopPropagation()"
        >
          <h2>Request access</h2>
          <p>
            Accounts are issued by hand. Email who you are and what you'd like to try it on, and
            you'll get a username and password back.
          </p>
          <div class="actions">
            <a class="open-btn" [href]="mailto()">✉ Open in my mail app</a>
            <button class="ghost-btn" type="button" (click)="close()">Close</button>
          </div>
          <p>or copy the address:</p>
          <div class="address-row">
            <span class="address">{{ address() }}</span>
            <button class="ghost-btn" type="button" (click)="copy()">
              {{ copied() ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <p>No form, nothing stored — it's just an email.</p>
        </div>
      </div>
    }
  `,
})
export class RequestAccessComponent {
  /** `bar` is the demo's full-width footer; `inline` sits under the sign-in card. */
  variant = input<'bar' | 'inline'>('bar');
  readonly showing = signal(false);
  readonly copied = signal(false);
  // Assembled on open, never held as a literal in the bundle.
  readonly address = signal('');
  readonly mailto = signal('');

  open(): void {
    this.address.set(accessAddress());
    this.mailto.set(accessMailto());
    this.copied.set(false);
    this.showing.set(true);
  }

  close(): void {
    this.showing.set(false);
  }

  copy(): void {
    // A locked-down machine may have no clipboard permission and no mail client; the
    // address stays selectable text either way, so a failure here is not an error.
    void navigator.clipboard
      ?.writeText(this.address())
      .then(() => this.copied.set(true))
      .catch(() => undefined);
  }
}
