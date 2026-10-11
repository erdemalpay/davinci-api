import { cafeHour, cafeStartOfToday, cafeToday } from './cafeTime';

describe('cafeTime', () => {
  afterEach(() => jest.useRealTimers());

  it('uses Istanbul time whatever the server time zone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T10:05:30Z'));

    expect(cafeToday()).toBe('2026-10-11');
    expect(cafeHour()).toBe('13:05:30');
    expect(cafeHour(false)).toBe('13:05');
  });

  it('is already the next day after midnight in Istanbul', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T21:30:00Z'));

    expect(cafeToday()).toBe('2026-10-12');
    expect(cafeHour(false)).toBe('00:30');
    expect(cafeStartOfToday().toISOString()).toBe('2026-10-11T21:00:00.000Z');
  });
});
