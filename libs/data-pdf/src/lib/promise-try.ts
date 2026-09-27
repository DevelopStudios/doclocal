/** pdf.js needs Promise.try, which older ZoneAwarePromise versions do not copy. */
export type PromiseTry = <T, A extends unknown[]>(
  this: PromiseConstructor, callback: (...args: A) => T | PromiseLike<T>, ...args: A
) => Promise<T>;

export function installPromiseTry(ctor: PromiseConstructor = Promise): void {
  if (typeof (ctor as PromiseConstructor & { try?: PromiseTry }).try === 'function') return;
  Object.defineProperty(ctor, 'try', {
    configurable: true,
    writable: true,
    value: function <T, A extends unknown[]>(
      this: PromiseConstructor, callback: (...args: A) => T | PromiseLike<T>, ...args: A
    ): Promise<T> {
      // The executor invokes synchronously, rejects thrown errors, and adopts thenables.
      // Using the receiver preserves Promise subclass construction.
      return new this<T>(resolve => resolve(callback(...args)));
    },
  });
}

installPromiseTry();
