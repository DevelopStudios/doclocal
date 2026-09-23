import type { HighlightSpan } from '@doclocal/data-pdf';
import type { Citation } from '../model';

const STOPWORDS = new Set((
    'the and for are was were been being has have had not but with from this that these those ' +
    'they them their there then than its his her him she you your our who whom which what when ' +
    'where why how all any also can could would should will may might into onto over under about ' +
    'after before again such some more most other only own same very just each both few does did ' +
    'doing including however additionally moreover therefore document excerpt excerpts mentioned ' +
    'mentions mention individual source sources reference references'
).split(' '));

const MAX_SEGMENT_WORDS = 25;

function keywords(text: string): Set<string> {
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return new Set(tokens.filter(t => (t.length >= 3 || /\d/.test(t)) && !STOPWORDS.has(t)));
}

/** Splits a chunk's words into sentence-like segments (sentence ends, bullets, length cap). */
function segments(words: string[]): { start: number; end: number }[] {
    const result: { start: number; end: number }[] = [];
    let start = 0;
    for (let i = 0; i < words.length; i++) {
        const bulletNext = i + 1 < words.length && /^[•▪◦·*-]$/.test(words[i + 1]);
        if (/[.!?;:]$/.test(words[i]) || bulletNext || i + 1 - start >= MAX_SEGMENT_WORDS || i === words.length - 1) {
            result.push({ start, end: i + 1 });
            start = i + 1;
        }
    }
    return result;
}

/**
 * The claim a citation marker supports: the last sentence before it, or all the text since the
 * previous marker when the marker follows a "Sources:" label or the last sentence has no content.
 */
function claimBefore(text: string): Set<string> {
    if (/(sources?|references?|citations?)\s*:?\s*$/i.test(text)) return keywords(text);
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const last = keywords(sentences.at(-1) ?? '');
    return last.size > 0 ? last : keywords(text);
}

/**
 * Fixes the `[n]` markers a small model gets wrong. Markers that open the answer move to the end of
 * its first sentence, back-to-back repeats collapse into one, and a marker is renumbered when
 * another excerpt shares clearly more keywords with its claim (at least two, and more than the
 * cited excerpt). The model reliably marks *where* a citation goes, not *which* excerpt.
 */
export function repairCitations(content: string, citations: Citation[]): string {
    const leading = content.match(/^\s*((?:\[\d+\]\s*)+)/);
    if (leading) {
        const rest = content.slice(leading[0].length);
        // A list number like "1." isn't a sentence end.
        const end = rest.search(/(?<!(?:^|\s)\d{1,3})[.!?](?=\s|$)/);
        const at = end === -1 ? rest.length : end + 1;
        content = `${rest.slice(0, at)} ${leading[1].trim()}${rest.slice(at)}`;
    }
    content = content.replace(/(\[(\d+)\])(\s*\[\2\])+/g, '$1');

    const excerptKeywords = citations.map(c => keywords(c.text));
    const support = (claim: Set<string>, index: number) =>
        [...claim].filter(t => excerptKeywords[index]?.has(t)).length;

    let prevEnd = 0;
    return content.replace(/\[(\d+)\]/g, (marker, n: string, offset: number) => {
        const claim = claimBefore(content.slice(prevEnd, offset));
        prevEnd = offset + marker.length;

        const cited = parseInt(n, 10) - 1;
        let best = cited;
        let bestScore = support(claim, cited);
        excerptKeywords.forEach((_, i) => {
            const score = support(claim, i);
            if (score > bestScore) { best = i; bestScore = score; }
        });
        return best !== cited && bestScore >= 2 ? `[${best + 1}]` : marker;
    });
}

/**
 * Word ranges in the cited excerpts that support each `[n]` claim in the answer. A sentence of
 * excerpt n supports the claim when they share at least two distinctive keywords — ones that
 * appear in few sentences across all excerpts (at most 2, or a tenth of them), so words like "work" or "days" can't match alone.
 */
export function citedSpans(content: string, citations: Citation[]): HighlightSpan[] {
    const segmented = citations.map(c => {
        const words = c.text.split(' ');
        return segments(words).map(seg => ({ ...seg, keywords: keywords(words.slice(seg.start, seg.end).join(' ')) }));
    });

    const docFreq = new Map<string, number>();
    const allSegments = segmented.flat();
    for (const seg of allSegments) {
        for (const t of seg.keywords) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
    const maxDocFreq = Math.max(2, Math.floor(allSegments.length / 10));
    const distinctive = (t: string) => (docFreq.get(t) ?? 0) <= maxDocFreq;

    const spans: HighlightSpan[] = [];
    const seen = new Set<string>();
    let claim: string[] = [];
    let prevEnd = 0;

    for (const match of content.matchAll(/\[(\d+)\]/g)) {
        const between = content.slice(prevEnd, match.index);
        if (keywords(between).size > 0) claim = [...claimBefore(between)].filter(t => docFreq.has(t) && distinctive(t));
        prevEnd = match.index + match[0].length;

        const index = parseInt(match[1], 10) - 1;
        const citation = citations[index];
        if (!citation || claim.length === 0) continue;

        const needed = Math.min(2, claim.length);
        for (const seg of segmented[index]) {
            if (claim.filter(t => seg.keywords.has(t)).length < needed) continue;
            const key = `${citation.chunkId}:${seg.start}`;
            if (seen.has(key)) continue;
            seen.add(key);
            spans.push({
                chunkId: citation.chunkId,
                pageNumber: citation.pageNumber,
                startWord: citation.startWord + seg.start,
                endWord: citation.startWord + seg.end,
            });
        }
    }
    return spans;
}

/**
 * What to highlight when a citation chip is clicked: the excerpt's sentences that support the
 * answer, or the whole excerpt when none match, so a click always lands on something visible.
 */
export function spansForCitation(content: string, citations: Citation[], citation: Citation): HighlightSpan[] {
    const spans = citedSpans(content, citations).filter(s => s.chunkId === citation.chunkId);
    if (spans.length > 0) return spans;
    return [{
        chunkId: citation.chunkId,
        pageNumber: citation.pageNumber,
        startWord: citation.startWord,
        endWord: citation.startWord + citation.text.split(' ').length,
    }];
}
