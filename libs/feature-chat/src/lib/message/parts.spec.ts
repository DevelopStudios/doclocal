import { parseParts } from './parts';
import type { Citation } from '../model';

const cite = (chunkId: string): Citation => ({ chunkId, text: chunkId, pageNumber: 1, startWord: 0, score: 1 });

describe('parseParts', () => {
    const citations = [cite('c1'), cite('c2')];

    it('splits text and citation markers, resolving each marker to its excerpt', () => {
        expect(parseParts('Alpha [1] beta [2].', citations)).toEqual([
            { type: 'text', value: 'Alpha ' },
            { type: 'cite', value: '[1]', citation: citations[0] },
            { type: 'text', value: ' beta ' },
            { type: 'cite', value: '[2]', citation: citations[1] },
            { type: 'text', value: '.' },
        ]);
    });

    it('drops citation markers that come before any answer text', () => {
        expect(parseParts('[2] [1] This document outlines [2].', citations)).toEqual([
            { type: 'text', value: 'This document outlines ' },
            { type: 'cite', value: '[2]', citation: citations[1] },
            { type: 'text', value: '.' },
        ]);
    });

    it('keeps an out-of-range marker as a chip without a citation', () => {
        expect(parseParts('Alpha [9]', citations)[1]).toEqual({ type: 'cite', value: '[9]', citation: undefined });
    });
});
