import { evenlySpaced } from './spread';

describe('evenlySpaced', () => {
  it('returns everything when there are no more items than requested', () => {
    expect(evenlySpaced([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('picks items spread from the start to the end, in order', () => {
    expect(evenlySpaced([...Array(10).keys()], 4)).toEqual([0, 3, 6, 9]);
  });

  it('picks the first item when asked for one', () => {
    expect(evenlySpaced(['a', 'b', 'c'], 1)).toEqual(['a']);
  });

  it('returns nothing for k = 0', () => {
    expect(evenlySpaced([1, 2, 3], 0)).toEqual([]);
  });
});
