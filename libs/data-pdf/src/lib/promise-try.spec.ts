import { installPromiseTry, type PromiseTry } from './promise-try';

class TestPromise<T> extends Promise<T> {}
const target = TestPromise as typeof TestPromise & { try: PromiseTry };

beforeEach(() => {
  // Mask the inherited method, rather than testing the already-installed global one.
  Object.defineProperty(target, 'try', { configurable: true, writable: true, value: undefined });
  installPromiseTry(target);
});

describe('Promise.try compatibility', () => {
  it('installs without replacing an existing implementation or changing the global method', () => {
    const globalMethod = (Promise as PromiseConstructor & { try: PromiseTry }).try;
    const installed = target.try;
    expect(typeof installed).toBe('function');
    installPromiseTry(target);
    expect(target.try).toBe(installed);
    expect((Promise as PromiseConstructor & { try: PromiseTry }).try).toBe(globalMethod);
    expect(Object.getOwnPropertyDescriptor(target, 'try')?.enumerable).toBe(false);
  });

  it('invokes synchronously with arguments, and returns a promise of the result', async () => {
    let called = false;
    const result = target.try((a: number, b: number) => { called = true; return a + b; }, 3, 4);
    expect(called).toBe(true);
    await expect(result).resolves.toBe(7);
  });

  it('turns a synchronous exception into a rejection', async () => {
    const error = new Error('decode failed');
    await expect(target.try(() => { throw error; })).rejects.toBe(error);
  });

  it('adopts fulfilled and rejected promises', async () => {
    await expect(target.try(() => Promise.resolve('decoded'))).resolves.toBe('decoded');
    await expect(target.try(() => Promise.reject(new Error('invalid image')))).rejects.toThrow('invalid image');
  });

  it('constructs using the receiver and rejects invalid receivers synchronously', () => {
    expect(target.try(() => 1)).toBeInstanceOf(TestPromise);
    expect(() => Reflect.apply(target.try, null, [() => 1])).toThrow(TypeError);
  });
});
