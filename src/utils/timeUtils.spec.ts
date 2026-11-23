import {
  exceedsShiftNoticeTolerance,
  minutesForward,
  SHIFT_NOTICE_TOLERANCE_MINUTES,
} from './timeUtils';

describe('shift notice tolerance', () => {
  it('uses a 5 minute tolerance', () => {
    expect(SHIFT_NOTICE_TOLERANCE_MINUTES).toBe(5);
  });

  it('counts minutes forward across midnight', () => {
    expect(minutesForward('09:00', '09:05')).toBe(5);
    expect(minutesForward('23:55', '00:10')).toBe(15);
    expect(minutesForward('bad', '09:00')).toBe(0);
  });

  it('skips late entries within the tolerance', () => {
    expect(exceedsShiftNoticeTolerance('09:00', '09:05')).toBe(false);
    expect(exceedsShiftNoticeTolerance('09:00', '09:06')).toBe(true);
  });

  it('skips early exits within the tolerance', () => {
    expect(exceedsShiftNoticeTolerance('16:55', '17:00')).toBe(false);
    expect(exceedsShiftNoticeTolerance('16:54', '17:00')).toBe(true);
    expect(exceedsShiftNoticeTolerance('01:57', '02:00')).toBe(false);
  });
});
