import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { AuthService } from '@doclocal/data-auth';

/** The sign-in form. Nothing else in the app exists until it succeeds. */
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly auth = inject(AuthService);
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
