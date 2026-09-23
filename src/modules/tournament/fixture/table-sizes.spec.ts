import { planTableSizes } from './table-sizes';

describe('planTableSizes', () => {
  it.each([
    [15, 4, 2, [4, 4, 4, 3], 0],
    [12, 3, 2, [3, 3, 3, 3], 0],
    [13, 3, 2, [3, 3, 3, 2, 2], 0],
    [13, 3, 3, [3, 3, 3, 3], 1],
    [13, 4, 3, [4, 3, 3, 3], 0],
    [5, 4, 3, [4], 1],
    [2, 4, 3, [], 2],
  ])(
    '%i oyuncu, %i kişilik masa, en az %i → %j + %i bay',
    (players, tableSize, minTableSize, sizes, byeCount) => {
      expect(planTableSizes(players, tableSize, minTableSize)).toEqual({
        sizes,
        byeCount,
      });
    },
  );
});
