import { isConcurrentBreak } from './break.warning';

describe('isConcurrentBreak', () => {
  it.each([
    // [others on a break, people in the cafe, warn]
    [0, 3, false],
    [1, 3, true],
    [1, 4, false],
    [2, 4, true],
    [2, 6, true],
  ])('%i on a break with %i in the cafe → %s', (others, inCafe, expected) => {
    expect(isConcurrentBreak(others, inCafe)).toBe(expected);
  });
});
