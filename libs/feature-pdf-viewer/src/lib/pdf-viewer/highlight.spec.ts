import { buildParagraphs } from './highlight';

describe('buildParagraphs', () => {
    const page = 'one  two\nthree four five six';

    it('highlights only the words inside a span', () => {
        expect(buildParagraphs(page, [{ chunkId: 'b', pageNumber: 1, startWord: 2, endWord: 4 }])).toEqual([
            { chunkId: null, text: 'one two', highlighted: false },
            { chunkId: 'b', text: 'three four', highlighted: true },
            { chunkId: null, text: 'five six', highlighted: false },
        ]);
    });

    it('does not highlight anything without spans', () => {
        expect(buildParagraphs(page, [])).toEqual([
            { chunkId: null, text: 'one two three four five six', highlighted: false },
        ]);
    });

    it('merges overlapping spans without duplicating text', () => {
        const result = buildParagraphs(page, [
            { chunkId: 'a', pageNumber: 1, startWord: 0, endWord: 4 },
            { chunkId: 'b', pageNumber: 1, startWord: 2, endWord: 6 },
        ]);
        expect(result).toEqual([{ chunkId: 'a', text: 'one two three four five six', highlighted: true }]);
    });

    it('returns nothing for an empty page', () => {
        expect(buildParagraphs('   ', [{ chunkId: 'a', pageNumber: 1, startWord: 0, endWord: 3 }])).toEqual([]);
    });
});
