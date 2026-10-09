import { createThinkFilter } from './think-filter';

describe('createThinkFilter', () => {
  it('removes a complete think block and keeps the answer', () => {
    const filter = createThinkFilter();

    const out = filter.push('<think>weighing the options</think>The answer is 42.');

    expect(out + filter.flush()).toBe('The answer is 42.');
  });
});

describe('createThinkFilter, tags split across streamed tokens', () => {
  const streamThrough = (chunks: string[]): string => {
    const filter = createThinkFilter();
    return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
  };

  it('strips an opening tag arriving one token at a time', () => {
    expect(streamThrough(['<', 'think', '>', 'reasoning', '</think>', 'Answer.'])).toBe('Answer.');
  });

  it('strips a closing tag split mid-tag', () => {
    expect(streamThrough(['<think>reasoning</', 'think', '>Answer.'])).toBe('Answer.');
  });

  it('emits answer text as it streams rather than holding it to the end', () => {
    const filter = createThinkFilter();
    filter.push('<think>reasoning</think>');

    expect(filter.push('The answer ')).toBe('The answer ');
  });
});

describe('createThinkFilter, degenerate blocks', () => {
  const streamThrough = (chunks: string[]): string => {
    const filter = createThinkFilter();
    return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
  };

  it('removes the empty pair emitted when thinking is disabled', () => {
    expect(streamThrough(['<think></think>', 'Answer.'])).toBe('Answer.');
  });

  it('removes an empty pair split across tokens', () => {
    expect(streamThrough(['<think><', '/think>Answer.'])).toBe('Answer.');
  });

  it('drops an unterminated think block rather than rendering reasoning', () => {
    expect(streamThrough(['<think>reasoning that never closes'])).toBe('');
  });

  it('removes a stray closing tag that has no opener', () => {
    expect(streamThrough(['</think>Answer.'])).toBe('Answer.');
  });

  it('keeps a less-than sign that is ordinary answer text', () => {
    expect(streamThrough(['Chunk size 128 < ', '256 words.'])).toBe('Chunk size 128 < 256 words.');
  });

  it('keeps text that merely starts like the tag', () => {
    expect(streamThrough(['I was <thinking> aloud.'])).toBe('I was <thinking> aloud.');
  });

  it('removes several think blocks in one answer', () => {
    expect(streamThrough(['<think>a</think>One. <think>b</think>Two.'])).toBe('One. Two.');
  });
});
