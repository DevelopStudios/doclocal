import { attachCitations } from './citations';
import { NOT_FOUND } from './prompt';
import type { Citation } from '../model';

const cite = (chunkId: string, text: string, startWord = 0, pageNumber = 1): Citation =>
    ({ chunkId, text, pageNumber, startWord, score: 1 });

describe('attachCitations', () => {
    const fee = cite('c1',
        'The annual membership fee is 240 credits, payable before the first of March each year. ' +
        'New members pay a one time joining contribution of 100 credits.');
    const harvest = cite('c2',
        'Members must book pressing slots at least seven days in advance through the cooperative office. ' +
        'Cold storage is kept at two degrees Celsius.');
    const dispute = cite('c3',
        'A member who disagrees with a decision of the committee may request a review in writing within thirty days. ' +
        'The panel meets within twenty one days of receiving the request.');
    const excerpts = [fee, harvest, dispute];

    it('marks an unmarked sentence with the excerpt it shares distinctive terms with', () => {
        const out = attachCitations('The annual membership fee is 240 credits.', excerpts);

        expect(out).toBe('The annual membership fee is 240 credits [1].');
    });

    it('marks each sentence with its own excerpt', () => {
        const out = attachCitations(
            'The annual membership fee is 240 credits. Pressing slots are booked seven days in advance.',
            excerpts);

        expect(out).toBe(
            'The annual membership fee is 240 credits [1]. Pressing slots are booked seven days in advance [2].');
    });

    it('leaves an answer that already carries markers alone', () => {
        const already = 'The annual membership fee is 240 credits [1].';

        expect(attachCitations(already, excerpts)).toBe(already);
    });

    it('never marks the refusal', () => {
        expect(attachCitations(NOT_FOUND, excerpts)).toBe(NOT_FOUND);
    });

    it('leaves a sentence with no supporting excerpt unmarked', () => {
        const out = attachCitations('Tomorrow the weather should improve considerably.', excerpts);

        expect(out).toBe('Tomorrow the weather should improve considerably.');
    });

    it('does not mark on a single shared term', () => {
        const out = attachCitations('Members matter.', excerpts);

        expect(out).toBe('Members matter.');
    });

    it('returns empty content unchanged', () => {
        expect(attachCitations('', excerpts)).toBe('');
    });

    it('does nothing when there are no excerpts to cite', () => {
        const text = 'The annual membership fee is 240 credits.';

        expect(attachCitations(text, [])).toBe(text);
    });
});
