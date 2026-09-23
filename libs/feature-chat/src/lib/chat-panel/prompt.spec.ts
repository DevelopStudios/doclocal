import { buildPrompt } from './prompt';
import type { RagResult } from '@doclocal/data-rag';

const result = (id: string, text: string, pageNumber = 1): RagResult =>
    ({ chunk: { id, text, pageNumber, startWord: 0 }, score: 1 });

describe('buildPrompt', () => {
    const results = [result('c1', 'Alpha text.'), result('c2', 'Beta text.', 5), result('c3', 'Gamma text.')];

    it('numbers each excerpt from 1', () => {
        const prompt = buildPrompt(results, 'What?');
        expect(prompt).toContain('[1] Alpha text.');
        expect(prompt).toContain('[2] Beta text.');
        expect(prompt).toContain('[3] Gamma text.');
    });

    it('gives no concrete citation number outside the excerpts for the model to copy', () => {
        const prompt = buildPrompt(results, 'What?');
        const outsideExcerpts = prompt.replace(/^\[\d+\] .*$/gm, '');
        expect(outsideExcerpts).not.toMatch(/\[\d+\]/);
    });

    it('only asks for the "not found" reply when no excerpt relates to the question', () => {
        expect(buildPrompt(results, 'What?')).toMatch(/Only if none of the excerpts relate/);
        expect(buildPrompt(results, 'What?')).not.toMatch(/nothing else/);
    });

    it('asks for a brief "not found" reply when nothing was retrieved', () => {
        expect(buildPrompt([], 'What?')).toMatch(/no relevant content/);
    });
});
