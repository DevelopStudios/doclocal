import { stripMath } from './latex';

describe('stripMath', () => {
    it('unwraps inline math delimiters and keeps what is inside', () => {
        expect(stripMath('for \\(h\\) heads')).toBe('for h heads');
    });

    it('unwraps display math delimiters', () => {
        expect(stripMath('the loss \\[E = mc^2\\] follows')).toBe('the loss E = mc^2 follows');
    });

    it('unwraps the formula seen in the Attention paper answer', () => {
        expect(
            stripMath('MultiHead\\((Q,K,V)=\\text{Concat}(head_1,\\dots,head_h)W^O\\)'),
        ).toBe('MultiHead(Q,K,V)=Concat(head_1,…,head_h)W^O');
    });

    it('drops text-wrapper commands and the braces around their argument', () => {
        expect(stripMath('\\(d_k=d_v=d_{\\text{model}}/h\\)')).toBe('d_k=d_v=d_model/h');
        expect(stripMath('\\(\\mathrm{softmax}\\)')).toBe('softmax');
        expect(stripMath('\\(\\mathbf{Q}\\)')).toBe('Q');
    });

    it('drops brackets around an index inside a formula, as it does braces', () => {
        expect(stripMath('\\(a_{[1]}\\)')).toBe('a_1');
        expect(stripMath('\\(x[12] + y\\)')).toBe('x12 + y');
    });

    it('leaves bracketed numbers in prose alone, so citations still parse', () => {
        expect(stripMath('The model is faster [1].')).toBe('The model is faster [1].');
    });

    it('removes latex spacing commands', () => {
        expect(stripMath('\\(a\\,b\\;c\\)')).toBe('abc');
    });

    it('hides an inline formula that is still being streamed in', () => {
        expect(stripMath('for \\(h')).toBe('for');
        expect(stripMath('for \\')).toBe('for');
    });

    it('flattens sub- and superscripts that arrive with no delimiters around them', () => {
        expect(stripMath('a projection (∑_{i=1}^{h} head_i ) W_O [3]')).toBe(
            'a projection (∑_i=1^h head_i ) W_O [3]',
        );
        expect(stripMath('the matrix W^{O}')).toBe('the matrix W^O');
    });

    it('flattens a nested subscript', () => {
        expect(stripMath('d_{model_{out}}')).toBe('d_model_out');
    });

    it('leaves braces that are not a sub- or superscript alone', () => {
        expect(stripMath('Use {a, b} for the set.')).toBe('Use {a, b} for the set.');
        expect(stripMath('Call fn({ retries: 2 }) to configure it.')).toBe(
            'Call fn({ retries: 2 }) to configure it.',
        );
    });

    it('leaves ordinary prose untouched', () => {
        const prose = 'The Transformer reaches 41.0 BLEU at 1/4 the training cost [3].';
        expect(stripMath(prose)).toBe(prose);
    });

    it('leaves a lone dollar amount untouched', () => {
        expect(stripMath('It costs $40 to run.')).toBe('It costs $40 to run.');
    });

    it('leaves a windows path or stray backslash alone', () => {
        expect(stripMath('C:\\Users\\charl')).toBe('C:\\Users\\charl');
    });
});
