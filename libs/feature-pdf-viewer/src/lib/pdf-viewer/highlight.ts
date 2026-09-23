import type { HighlightSpan } from '@doclocal/data-pdf';

export interface RenderedParagraph {
    chunkId: string | null;
    text: string;
    highlighted: boolean;
}

/**
 * Splits a page into runs of highlighted / plain text. Spans are word offsets into the page's
 * whitespace-split words (the same split used by chunkPages), so overlapping spans and
 * irregular whitespace in the extracted text can't shift or duplicate a highlight.
 */
export function buildParagraphs(pageText: string, spans: HighlightSpan[]): RenderedParagraph[] {
    const words = pageText.split(/\s+/).filter(Boolean);
    const owner: (string | null)[] = new Array(words.length).fill(null);

    for (const span of spans) {
        const end = Math.min(words.length, span.endWord);
        for (let i = span.startWord; i < end; i++) owner[i] ??= span.chunkId;
    }

    const paragraphs: RenderedParagraph[] = [];
    let start = 0;
    for (let i = 1; i <= words.length; i++) {
        if (i < words.length && (owner[i] === null) === (owner[start] === null)) continue;
        paragraphs.push({
            chunkId: owner[start],
            text: words.slice(start, i).join(' '),
            highlighted: owner[start] !== null,
        });
        start = i;
    }
    return paragraphs;
}
