/** A pdf.js text-content item: a text run, or a marked-content item (which has no text). */
export type TextItemLike = { str: string; hasEOL: boolean } | { type: string };

/**
 * A page's text with its line breaks: text runs on a line are joined with spaces and a line ends
 * where pdf.js marks one (`hasEOL`). Repeated spaces and blank lines collapse, so word indices
 * are the same as splitting the flattened text on whitespace.
 */
export function pageText(items: TextItemLike[]): string {
  return items
    .map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
    .join('')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}
