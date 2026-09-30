import { parseSseFrames } from './sse-decoder';

describe('parseSseFrames', () => {
  it('parses a single complete frame', () => {
    const { frames, remainder } = parseSseFrames('event: token\ndata: {"token":"hi"}\n\n');
    expect(frames).toEqual([{ event: 'token', data: '{"token":"hi"}' }]);
    expect(remainder).toBe('');
  });

  it('preserves incomplete frame as remainder', () => {
    const { frames, remainder } = parseSseFrames('event: token\ndata: {"token"');
    expect(frames).toEqual([]);
    expect(remainder).toBe('event: token\ndata: {"token"');
  });

  it('handles split across double-newline boundary', () => {
    const part1 = 'event: token\ndata: {"token":"hi"}\n';
    const part2 = '\nevent: done\ndata: {}\n\n';
    const r1 = parseSseFrames(part1);
    expect(r1.frames).toEqual([]);
    const r2 = parseSseFrames(r1.remainder + part2);
    expect(r2.frames).toHaveLength(2);
    expect(r2.frames[0]).toEqual({ event: 'token', data: '{"token":"hi"}' });
    expect(r2.frames[1]).toEqual({ event: 'done', data: '{}' });
  });

  it('parses multiple frames in one chunk', () => {
    const input =
      'event: citations\ndata: {"citations":[]}\n\nevent: token\ndata: {"token":"x"}\n\n';
    const { frames } = parseSseFrames(input);
    expect(frames).toHaveLength(2);
  });

  it('uses "message" as default event when event line is absent', () => {
    const { frames } = parseSseFrames('data: {"token":"x"}\n\n');
    expect(frames[0].event).toBe('message');
  });

  it('handles CRLF line endings', () => {
    const { frames } = parseSseFrames('event: done\r\ndata: {}\r\n\r\n');
    expect(frames).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('skips frames without a data line', () => {
    const { frames } = parseSseFrames('event: ping\n\n');
    expect(frames).toEqual([]);
  });

  it('handles empty remainder when last char completes a frame', () => {
    const { remainder } = parseSseFrames('event: done\ndata: {}\n\n');
    expect(remainder).toBe('');
  });
});
