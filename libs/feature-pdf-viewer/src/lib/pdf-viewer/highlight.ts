import type { HighlightSpan } from '@doclocal/data-pdf';

export interface RenderedParagraph {
    chunkId: string | null;
    text: string;
    /** Whitespace between this run and the next: a line break, a space, or nothing at the end. */
    trailing: string;
    highlighted: boolean;
}

/**
 * Splits a page into runs of highlighted / plain text, keeping its line breaks. Spans are word offsets into the page's
 * whitespace-split words (the same split used by chunkPages), so overlapping spans and
 * irregular whitespace in the extracted text can't shift or duplicate a highlight.
 */
export function buildParagraphs(pageText: string, spans: HighlightSpan[]): RenderedParagraph[] {
    // Same words as splitting on whitespace, but each keeps the separator after it: a line break
    // when the whitespace contains one, otherwise a single space.
    const tokens = [...pageText.matchAll(/(\S+)(\s*)/g)].map(m => ({
        word: m[1],
        after: m[2] === '' ? '' : m[2].includes('\n') ? '\n' : ' ',
    }));
    const last = tokens.at(-1);
    if (last) last.after = '';
    const words = tokens.map(t => t.word);
    const owner: (string | null)[] = new Array(words.length).fill(null);

    for (const span of spans) {
        const end = Math.min(words.length, span.endWord);
        for (let i = span.startWord; i < end; i++) owner[i] ??= span.chunkId;
    }

    const paragraphs: RenderedParagraph[] = [];
    let start = 0;
    for (let i = 1; i <= words.length; i++) {
        if (i < words.length && (owner[i] === null) === (owner[start] === null)) continue;
        const run = tokens.slice(start, i);
        paragraphs.push({
            chunkId: owner[start],
            text: run.map((t, j) => t.word + (j < run.length - 1 ? t.after : '')).join(''),
            trailing: run[run.length - 1].after,
            highlighted: owner[start] !== null,
        });
        start = i;
    }
    return paragraphs;
}
