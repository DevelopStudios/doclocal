import { Component, effect, inject, signal } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';
import { Login } from './login/login';
import { Workspace } from './workspace/workspace';

type Theme = 'dark' | 'light' | 'mono';

/**
 * The sign-in gate. The workspace is only created once signed in, and destroyed on
 * sign-out or when the session ends, so nothing of one person's document survives into
 * the next person's session on a shared machine.
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

  readonly themes: Theme[] = ['dark', 'light', 'mono'];

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  signOut(): void {
    void this.auth.logout();
  }
}
