import type { HighlightSpan } from '@doclocal/data-pdf';

export interface TextRange { item: number; start: number; end: number; chunkId: string }

/** Map retrieval's cleaned word offsets back into pdf.js's original text runs. */
export function textRanges(items: string[], cleaned: string, spans: HighlightSpan[]): TextRange[] {
  const words = items.flatMap((text, item) => [...text.matchAll(/\S+/g)].map(match =>
    ({ text: match[0], item, start: match.index, end: match.index + match[0].length })));
  const cleanWords = cleaned.match(/\S+/g) ?? [];
  if (cleanWords.length === 0) return [];
  // Cleaning only removes page-edge words. Match the entire retained sequence so a
  // repeated heading cannot shift a citation onto the wrong occurrence.
  const offset = words.findIndex((_, i) => cleanWords.every((word, j) => words[i + j]?.text === word));
  if (offset < 0) return [];

  const ranges: TextRange[] = [];
  for (const span of spans) {
    const selected = words.slice(offset + Math.max(0, span.startWord), offset + Math.min(cleanWords.length, span.endWord));
    let previous: TextRange | undefined;
    for (const word of selected) {
      if (previous?.item === word.item) previous.end = word.end;
      else {
        previous = { item: word.item, start: word.start, end: word.end, chunkId: span.chunkId };
        ranges.push(previous);
      }
    }
  }
  return ranges;
}
