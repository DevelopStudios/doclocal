import { resolveApiBaseUrl } from './api-url';

const localPage = { origin: 'http://localhost:4200', protocol: 'http:', hostname: 'localhost' };
const remotePage = {
  origin: 'https://app.example.test',
  protocol: 'https:',
  hostname: 'app.example.test',
};

describe('resolveApiBaseUrl', () => {
  it('uses the page origin when empty (dev proxy)', () => {
    expect(resolveApiBaseUrl('', localPage)).toBe('http://localhost:4200');
    expect(resolveApiBaseUrl('  ', remotePage)).toBe('https://app.example.test');
  });

  it('treats a leading-slash value as a prefix on the page origin (dev proxy)', () => {
    expect(resolveApiBaseUrl('/api', localPage)).toBe('http://localhost:4200/api');
    expect(resolveApiBaseUrl('/api/', remotePage)).toBe('https://app.example.test/api');
    expect(resolveApiBaseUrl('/', remotePage)).toBe('https://app.example.test');
  });

  it('refuses a same-origin prefix that is not a plain path', () => {
    // `//host` is protocol-relative: it would send credentials to another origin.
    expect(() => resolveApiBaseUrl('//evil.test/api', remotePage)).toThrow(/protocol-relative/);
    expect(() => resolveApiBaseUrl('/api?x=1', remotePage)).toThrow(/query or fragment/);
    expect(() => resolveApiBaseUrl('/api#x', remotePage)).toThrow(/query or fragment/);
  });

  it('refuses a same-origin prefix when the page itself is unsafe HTTP', () => {
    const page = { origin: 'http://intranet.test', protocol: 'http:', hostname: 'intranet.test' };
    expect(() => resolveApiBaseUrl('/api', page)).toThrow(/HTTPS/);
  });

  it('refuses the page origin when it is plain HTTP on another host', () => {
    const page = { origin: 'http://intranet.test', protocol: 'http:', hostname: 'intranet.test' };
    expect(() => resolveApiBaseUrl('', page)).toThrow(/HTTPS/);
  });

  it.each([
    ['https://api.example.test', 'https://api.example.test'],
    ['https://api.example.test/', 'https://api.example.test'],
    ['https://api.example.test/backend/', 'https://api.example.test/backend'],
    ['http://localhost:8000', 'http://localhost:8000'],
    ['http://127.0.0.1:8000', 'http://127.0.0.1:8000'],
    ['http://[::1]:8000', 'http://[::1]:8000'],
  ])('accepts %s', (configured, expected) => {
    expect(resolveApiBaseUrl(configured, remotePage)).toBe(expected);
  });

  it.each([
    ['http://api.example.test', /HTTPS/],
    ['ftp://api.example.test', /HTTPS/],
    ['javascript:alert(1)', /HTTPS/],
    ['https://user:pass@api.example.test', /credentials/],
    ['https://user@api.example.test', /credentials/],
    ['https://api.example.test/?next=x', /query or fragment/],
    ['https://api.example.test/?', /query or fragment/],
    ['https://api.example.test/#x', /query or fragment/],
    ['api.example.test', /absolute/],
  ])('rejects %s', (configured, message) => {
    expect(() => resolveApiBaseUrl(configured, remotePage)).toThrow(message);
  });

  it('never repeats the configured value in its message', () => {
    expect(() => resolveApiBaseUrl('https://user:hunter2@api.example.test', remotePage)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });
});
