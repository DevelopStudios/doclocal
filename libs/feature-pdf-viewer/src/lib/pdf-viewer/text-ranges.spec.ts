import { textRanges } from './text-ranges';

describe('PDF text-layer citation offsets (#32)', () => {
  it('maps cleaned offsets past a stripped header into the original text runs', () => {
    expect(textRanges(['HEADER ', 'Objective statement ', 'is vague. ', 'FOOTER'],
      'Objective statement\nis vague.', [{ chunkId: 'c', pageNumber: 1, startWord: 2, endWord: 4 }]))
      .toEqual([{ item: 2, start: 0, end: 9, chunkId: 'c' }]);
  });

  it('maps a partial text run and spans multiple runs', () => {
    expect(textRanges(['One two three', 'four five'], 'One two three four five',
      [{ chunkId: 'c', pageNumber: 1, startWord: 1, endWord: 4 }]))
      .toEqual([{ item: 0, start: 4, end: 13, chunkId: 'c' }, { item: 1, start: 0, end: 4, chunkId: 'c' }]);
  });

  it('does not guess offsets when text does not match or the page is image-only', () => {
    const spans = [{ chunkId: 'c', pageNumber: 1, startWord: 0, endWord: 2 }];
    expect(textRanges(['Different text'], 'Missing words', spans)).toEqual([]);
    expect(textRanges([], '', spans)).toEqual([]);
  });

  it('chooses the complete cleaned sequence rather than an earlier repeated word', () => {
    expect(textRanges(['Title other Title body'], 'Title body',
      [{ chunkId: 'c', pageNumber: 1, startWord: 0, endWord: 1 }]))
      .toEqual([{ item: 0, start: 12, end: 17, chunkId: 'c' }]);
  });
});
