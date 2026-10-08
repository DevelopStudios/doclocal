import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, inject, InjectionToken, signal, viewChild } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';

/**
 * Opens a compose window in a new tab. Injected rather than called directly so a test
 * can read the composed link, and a new tab rather than this one so the sign-in page
 * is still there when someone comes back.
 */
export const COMPOSE_OPENER = new InjectionToken<(url: string) => void>('COMPOSE_OPENER', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return (url: string) => void view?.open(url, '_blank', 'noopener,noreferrer');
  },
});

// Held in pieces and joined at click time: the app is a single-page bundle, so the
// address is never in the served HTML, and splitting it keeps an address-shaped regex
// over main.js from finding one either. The `+doclocal` tag makes the inbox filterable
// and the whole address rotatable -- if it ever starts drawing spam, edit this line.
const RECIPIENT = ['charlit641', '+doclocal', '@', 'gmail', '.com'];

const SUBJECT = 'DocLocal access request';

const BODY = ['Name:', 'Organisation:', 'What you would like to use DocLocal for:', ''].join('\n');

/**
 * Gmail's compose window. The default because it is plain https: it opens for everyone,
 * signed in or not. `mailto:` cannot promise that -- a browser with no mail handler
 * answers it with ERR_UNKNOWN_URL_SCHEME, which would take the whole app down with it.
 * It stays available as a link for anyone who does have a mail app.
 */
const GMAIL_COMPOSE = 'https://mail.google.com/mail/?view=cm&fs=1';

/** The sign-in form. Nothing else in the app exists until it succeeds. */
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly auth = inject(AuthService);
  private readonly openCompose = inject(COMPOSE_OPENER);
  private password = viewChild.required<ElementRef<HTMLInputElement>>('password');

  /** Whether the access-request panel is showing. Collapsed until someone asks. */
  readonly requestOpen = signal(false);
  /**
   * The address and its `mailto:`, in the page only after a deliberate click. Gmail is
   * not everyone's mail, so both need to be reachable -- but a scraper loading the page
   * gets neither.
   */
  readonly address = signal<string | null>(null);
  readonly mailtoLink = signal<string | null>(null);

  toggleRequest() {
    this.requestOpen.update((open) => !open);
  }

  /**
   * Builds the request mail from constants alone. Nothing typed into this page and
   * nothing from the URL reaches either link, so there is no string a header (`cc:`, a
   * second recipient) could be smuggled through.
   */
  requestAccess() {
    const address = RECIPIENT.join('');
    const subject = encodeURIComponent(SUBJECT);
    const body = encodeURIComponent(BODY);
    this.openCompose(
      `${GMAIL_COMPOSE}&to=${encodeURIComponent(address)}&su=${subject}&body=${body}`,
    );
    this.address.set(address);
    this.mailtoLink.set(`mailto:${address}?subject=${subject}&body=${body}`);
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
