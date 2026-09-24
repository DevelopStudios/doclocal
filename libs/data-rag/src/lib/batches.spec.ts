import { batches } from './batches';

describe('batches', () => {
  it('splits items into groups of the given size, keeping order', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one group when everything fits', () => {
    expect(batches([1, 2], 8)).toEqual([[1, 2]]);
  });

  it('returns no groups for no items', () => {
    expect(batches([], 8)).toEqual([]);
  });
});
