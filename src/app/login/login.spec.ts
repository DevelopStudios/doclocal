import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@doclocal/data-auth';
import { Login, MAILTO_OPENER } from './login';

describe('Login (request access)', () => {
  let openMail: jasmine.Spy;
  let login: jasmine.Spy;

  beforeEach(() => {
    openMail = jasmine.createSpy('openMail');
    login = jasmine.createSpy('login').and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: MAILTO_OPENER, useValue: openMail },
        {
          provide: AuthService,
          useValue: {
            status: signal('signed-out'),
            error: signal(null),
            configError: null,
            login,
          },
        },
      ],
    });
  });

  const render = () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  };

  const toggle = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[aria-controls="request-access"]')!;

  it('offers the request without an address anywhere in the page', () => {
    const el: HTMLElement = render().nativeElement;
    expect(toggle(el).textContent).toContain('Request access');
    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#request-access')).toBeNull();
    // A scraper reading the rendered page must find nothing to harvest.
    expect(el.textContent).not.toContain('@');
    expect(el.innerHTML).not.toContain('mailto:');
  });

  it('expands the panel and says what to send', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    toggle(el).click();
    fixture.detectChanges();
    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#request-access')?.textContent).toContain('by hand');
    // Still nothing to harvest: the address waits for a deliberate click.
    expect(el.textContent).not.toContain('@');
  });

  it('does not sign in when the toggle is clicked', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    // Filled in, so a toggle that submitted the form would reach the backend.
    el.querySelector<HTMLInputElement>('input[name=username]')!.value = 'charl';
    el.querySelector<HTMLInputElement>('input[name=password]')!.value = 'hunter2';
    toggle(el).click();
    fixture.detectChanges();
    expect(login).not.toHaveBeenCalled();
  });

  it('composes a mailto with the tagged recipient, subject and template', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    toggle(el).click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.request-mail')!.click();

    expect(openMail).toHaveBeenCalledTimes(1);
    const raw = openMail.calls.mostRecent().args[0] as string;
    const url = new URL(raw);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('charlit641+doclocal@gmail.com');
    expect(url.searchParams.get('subject')).toBe('DocLocal access request');
    expect(url.searchParams.get('body')).toContain('Name:');
    // No recipient header may be smuggled in: the link is built from constants only.
    expect(url.searchParams.get('cc')).toBeNull();
    expect(url.searchParams.get('bcc')).toBeNull();
    // The template's own newlines are encoded inside the body; a *raw* line break is
    // what would end the body and let a header follow it.
    expect(raw).not.toMatch(/[\r\n]/);
  });

  it('reveals a copyable address only once the mail client has been asked for', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    toggle(el).click();
    fixture.detectChanges();
    expect(el.querySelector('.request-fallback')).toBeNull();

    el.querySelector<HTMLButtonElement>('.request-mail')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.request-fallback')?.textContent).toContain(
      'charlit641+doclocal@gmail.com',
    );
  });
});
