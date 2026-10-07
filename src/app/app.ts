import { Component, effect, inject, signal } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';
import { Login } from './login/login';
import { Workspace } from './workspace/workspace';

type Theme = 'dark' | 'light' | 'mono';

/**
 * The shell, and which of three things a visitor sees.
 *
 * Sign-in used to be the whole app; it is now a secondary door. A cold visitor lands
 * on the demo, because the link in the portfolio and on LinkedIn points here and a
 * password prompt is where that visitor left.
 *
 * The workspace is still only created once signed in, and destroyed on sign-out or
 * when the session ends, so nothing of one person's document survives into the next
 * person's session on a shared machine. The demo gets its own instance of it, in demo
 * mode: one pinned document, and no upload, replace or delete.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Login, Workspace],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);

  theme = signal<Theme>('dark');
  /** Which door an anonymous visitor is at. Not a route: there are no URLs here yet,
   * and a demo does not obviously need one. */
  door = signal<'demo' | 'signin'>('demo');

  readonly themes: Theme[] = ['dark', 'light', 'mono'];

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  signOut(): void {
    void this.auth.logout();
    this.door.set('demo');
  }
}
