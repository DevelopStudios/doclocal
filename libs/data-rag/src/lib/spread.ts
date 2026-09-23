/** `k` items spread evenly from the first to the last, in their original order. */
export function evenlySpaced<T>(items: T[], k: number): T[] {
  if (k <= 0) return [];
  if (items.length <= k) return [...items];
  if (k === 1) return [items[0]];
  return Array.from({ length: k }, (_, i) => items[Math.round((i * (items.length - 1)) / (k - 1))]);
}
