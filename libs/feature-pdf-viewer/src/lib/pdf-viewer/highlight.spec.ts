import { buildParagraphs } from './highlight';

describe('buildParagraphs', () => {
    const page = 'one  two\nthree four five six';

    it('highlights only the words inside a span', () => {
        expect(buildParagraphs(page, [{ chunkId: 'b', pageNumber: 1, startWord: 2, endWord: 4 }])).toEqual([
            { chunkId: null, text: 'one two', trailing: '\n', highlighted: false },
            { chunkId: 'b', text: 'three four', trailing: ' ', highlighted: true },
            { chunkId: null, text: 'five six', trailing: '', highlighted: false },
        ]);
    });

    it('does not highlight anything without spans', () => {
        expect(buildParagraphs(page, [])).toEqual([
            { chunkId: null, text: 'one two\nthree four five six', trailing: '', highlighted: false },
        ]);
    });

    it('merges overlapping spans without duplicating text', () => {
        const result = buildParagraphs(page, [
            { chunkId: 'a', pageNumber: 1, startWord: 0, endWord: 4 },
            { chunkId: 'b', pageNumber: 1, startWord: 2, endWord: 6 },
        ]);
        expect(result).toEqual([{ chunkId: 'a', text: 'one two\nthree four five six', trailing: '', highlighted: true }]);
    });

    it('keeps line breaks and collapses other whitespace runs to one space', () => {
        expect(buildParagraphs('Title\n\n  • one   two\n• three', [])[0].text).toBe('Title\n• one two\n• three');
    });

    it('returns nothing for an empty page', () => {
        expect(buildParagraphs('   ', [{ chunkId: 'a', pageNumber: 1, startWord: 0, endWord: 3 }])).toEqual([]);
    });
});
