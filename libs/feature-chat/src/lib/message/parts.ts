import type { Citation } from '../model';

export interface TextPart { type: 'text'; value: string; }
export interface CitePart { type: 'cite'; value: string; citation: Citation | undefined; }
export type Part = TextPart | CitePart;

/**
 * Splits an answer into text runs and `[n]` citation chips. Markers before any answer text are
 * dropped: a citation that opens the answer supports no claim. A marker still being streamed in
 * (a trailing `[`, `[1` or `[n`) is hidden until it completes, and a one-letter placeholder like
 * `[n]`, copied from the prompt's citation rule, is dropped with the space before it.
 */
export function parseParts(content: string, citations: Citation[]): Part[] {
  content = content.replace(/\s*\[[a-zA-Z]\]/g, '').replace(/\[(?:\d*|[a-zA-Z])$/, '');
  const result: Part[] = [];
  let last = 0;
  let hasText = false;

  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const text = content.slice(last, match.index);
    const first = !hasText && text.trim() !== '';
    if (first) hasText = true;
    if (hasText && text) result.push({ type: 'text', value: first ? text.trimStart() : text });
    if (hasText) {
      result.push({ type: 'cite', value: match[0], citation: citations[parseInt(match[1], 10) - 1] });
    }
    last = match.index + match[0].length;
  }

  const rest = hasText ? content.slice(last) : content.slice(last).trimStart();
  if (rest) result.push({ type: 'text', value: rest });
  return result;
}
