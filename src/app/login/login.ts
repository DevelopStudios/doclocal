import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, inject, InjectionToken, signal, viewChild } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';

/**
 * Opens a `mailto:` URL. Injected rather than called directly so a test can read the
 * composed link without handing the browser a navigation.
 */
export const MAILTO_OPENER = new InjectionToken<(url: string) => void>('MAILTO_OPENER', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return (url: string) => view?.location.assign(url);
  },
});

// Held in pieces and joined at click time: the app is a single-page bundle, so the
// address is never in the served HTML, and splitting it keeps an address-shaped regex
// over main.js from finding one either. The `+doclocal` tag makes the inbox filterable
// and the whole address rotatable -- if it ever starts drawing spam, edit this line.
const RECIPIENT = ['charlit641', '+doclocal', '@', 'gmail', '.com'];

const SUBJECT = 'DocLocal access request';

const BODY = ['Name:', 'Organisation:', 'What you would like to use DocLocal for:', ''].join('\n');

/** The sign-in form. Nothing else in the app exists until it succeeds. */
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly auth = inject(AuthService);
  private readonly openMail = inject(MAILTO_OPENER);
  private password = viewChild.required<ElementRef<HTMLInputElement>>('password');

  /** Whether the access-request panel is showing. Collapsed until someone asks. */
  readonly requestOpen = signal(false);
  /**
   * The address, in the page only after a deliberate click. A mail client that is not
   * configured swallows the `mailto:` silently, so webmail users need something to copy
   * -- but a scraper loading the page gets nothing.
   */
  readonly revealedAddress = signal<string | null>(null);

  toggleRequest() {
    this.requestOpen.update((open) => !open);
  }

  /**
   * Builds the request mail from constants alone. Nothing typed into this page and
   * nothing from the URL reaches the link, so there is no string a header (`cc:`, a
   * second recipient) could be smuggled through.
   */
  requestAccess() {
    const address = RECIPIENT.join('');
    const query = `subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;
    this.openMail(`mailto:${address}?${query}`);
    this.revealedAddress.set(address);
  }

  async submit(event: Event, username: string) {
    event.preventDefault();
    const field = this.password().nativeElement;
    const password = field.value;
    // Not kept anywhere, including the input, once it has been sent.
    field.value = '';
    if (!username.trim() || !password) return;
    const signedIn = await this.auth.login(username.trim(), password);
    if (!signedIn) field.focus();
  }
}
