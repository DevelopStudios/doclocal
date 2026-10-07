import { Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';
import { RequestAccessComponent } from '../request-access/request-access';

/**
 * The sign-in form, for the handful of people who have an account.
 *
 * The form itself is unchanged. What is new is that it is no longer a dead end: both
 * exits below are useless if they are invisible, which is what they were.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RequestAccessComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly auth = inject(AuthService);
  tryDemo = output<void>();
  private password = viewChild.required<ElementRef<HTMLInputElement>>('password');

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
