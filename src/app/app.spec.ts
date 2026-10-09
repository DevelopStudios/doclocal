import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '@doclocal/data-auth';
import type { AuthStatus, AuthUser } from '@doclocal/data-auth';
import { PdfService } from '@doclocal/data-pdf';
import { BackendService } from '@doclocal/data-backend';
import { App } from './app';
import { HOSTED_MODE } from './tier-mode';

describe('App (tier gate)', () => {
  let status: ReturnType<typeof signal<AuthStatus>>;
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let logout: jasmine.Spy;

  const configure = (hosted: boolean) => {
    status = signal<AuthStatus>('signed-out');
    user = signal<AuthUser | null>(null);
    logout = jasmine.createSpy('logout').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            status,
            user,
            logout,
            error: signal(null),
            configError: null,
            baseUrl: '/api',
            authorizationHeader: () => null,
            handleUnauthorized: () => undefined,
            login: jasmine.createSpy('login'),
          },
        },
        // The workspace injects these; it is only created once signed in.
        { provide: PdfService, useValue: { parse: jasmine.createSpy('parse') } },
        {
          provide: BackendService,
          useValue: {
            indexDocument$: jasmine.createSpy('index').and.returnValue(of(undefined)),
            deleteSession$: jasmine.createSpy('remove').and.returnValue(of(undefined)),
            sessionStatus: signal('none'),
            sessionError: signal(null),
            chat$: jasmine.createSpy('chat$'),
          },
        },
        { provide: HOSTED_MODE, useValue: hosted },
      ],
    });
  };

  const render = () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  };

  it('answers on the device with no account, which is the default', () => {
    configure(false);

    const el: HTMLElement = render().nativeElement;

    // No sign-in: the on-device path spends nothing and sends nothing.
    expect(el.querySelector('app-login')).toBeNull();
    expect(el.querySelector('app-workspace')).toBeTruthy();
    expect(el.querySelector('pdf-upload-dropzone')).toBeTruthy();
  });

  it('still gates the hosted path behind sign-in, which spends money', () => {
    configure(true);

    const el: HTMLElement = render().nativeElement;

    expect(el.querySelector('app-login')).toBeTruthy();
    expect(el.querySelector('app-workspace')).toBeNull();
    // Nothing a document could be dropped on until someone has signed in.
    expect(el.querySelector('pdf-upload-dropzone')).toBeNull();
  });

  it('shows the workspace and who is signed in once signed in', () => {
    configure(true);
    status.set('signed-in');
    user.set({ id: 'sign-in-1', username: 'alice' });

    const el: HTMLElement = render().nativeElement;

    expect(el.querySelector('app-workspace')).toBeTruthy();
    expect(el.querySelector('app-login')).toBeNull();
    expect(el.querySelector('.signed-in-as')?.textContent).toContain('alice');
  });

  it('destroys the workspace when the session ends, so nothing of it is left behind', () => {
    configure(true);
    status.set('signed-in');
    user.set({ id: 'sign-in-1', username: 'alice' });
    const fixture = render();
    expect(fixture.nativeElement.querySelector('app-workspace')).toBeTruthy();

    // What AuthService does on sign-out, expiry, or a 401 from any API call.
    status.set('signed-out');
    user.set(null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-workspace')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-login')).toBeTruthy();
  });

  it('lets the signed-in view fill the shell instead of collapsing to its content', () => {
    configure(true);
    // The shell is a flex column; App renders Workspace/Login through an extra element,
    // so each must be a growing flex item or `flex: 1` inside it resolves against a host
    // that never stretched and the whole view collapses to content height.
    status.set('signed-in');
    user.set({ id: 'sign-in-1', username: 'alice' });
    const fixture = render();

    const host = fixture.nativeElement.querySelector('app-workspace') as HTMLElement;
    const style = getComputedStyle(host);

    expect(style.display).toBe('flex');
    expect(style.flexGrow).toBe('1');
  });

  it('lets the signed-out view fill the shell too, so the form stays centred', () => {
    configure(true);
    const host = render().nativeElement.querySelector('app-login') as HTMLElement;
    const style = getComputedStyle(host);

    expect(style.display).toBe('flex');
    expect(style.flexGrow).toBe('1');
  });

  it('revokes the session on the backend when signing out', () => {
    configure(true);
    status.set('signed-in');
    user.set({ id: 'sign-in-1', username: 'alice' });
    const fixture = render();

    fixture.nativeElement.querySelector('.signout-btn').click();

    expect(logout).toHaveBeenCalled();
  });

  it('offers no sign-out control while signed out', () => {
    configure(true);
    expect(render().nativeElement.querySelector('.signout-btn')).toBeNull();
  });
});
