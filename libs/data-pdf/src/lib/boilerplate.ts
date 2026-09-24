const MIN_PAGES = 4;
const MIN_SHARE = 0.6;
/** Headers and footers are short; never strip deeper than this into a page. */
const MAX_EDGE_WORDS = 12;

/** Page numbers change from page to page, so compare words with their digits masked. */
const normalize = (word: string) => word.toLowerCase().replace(/\d+/g, '#');

/** A word and the whitespace that follows it, so stripping keeps the page's line breaks. */
interface Token { text: string; after: string; }
const tokenize = (page: string): Token[] =>
  [...page.matchAll(/(\S+)(\s*)/g)].map(m => ({ text: m[1], after: m[2] }));

/**
 * Removes running headers and footers: words that open (or close) at least 60% of pages, taken
 * one word at a time from the page edge so multi-word and doubled headers go too. A page whose
 * only text is a header word (an image-only slide) ends up empty. Documents under 4 pages are
 * left alone.
 */
export function stripRepeatedText(pages: string[]): string[] {
  const words = pages.map(tokenize);
  if (words.length < MIN_PAGES) return pages;
  const needed = Math.ceil(words.filter(w => w.length > 0).length * MIN_SHARE);
  const stripped = new Set<string>();

  for (const edge of ['start', 'end'] as const) {
    const at = (w: Token[]) => (edge === 'start' ? w[0] : w[w.length - 1]).text;
    for (let depth = 0; depth < MAX_EDGE_WORDS; depth++) {
      const counts = new Map<string, number>();
      for (const w of words) {
        if (w.length > 1) counts.set(normalize(at(w)), (counts.get(normalize(at(w))) ?? 0) + 1);
      }
      const [word, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
      if (count < needed) break;
      stripped.add(word);
      for (const w of words) {
        if (w.length > 1 && normalize(at(w)) === word) {
          if (edge === 'start') w.shift(); else w.pop();
        }
      }
    }
  }
  // One-word pages are skipped above so a lone word isn't mistaken for a header; empty them only
  // when that word is one of the headers we found.
  return words.map(w =>
    w.length === 1 && stripped.has(normalize(w[0].text)) ? '' : w.map(t => t.text + t.after).join('').trim());
}
