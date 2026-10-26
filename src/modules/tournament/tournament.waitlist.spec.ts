import {
  isOverLimit,
  registrationStatus,
  waitlistNumber,
} from './tournament.waitlist';

describe('waitlistNumber', () => {
  it('kontenjan içindeyse asildir (undefined)', () => {
    expect(waitlistNumber(64, 64)).toBeUndefined();
  });

  it('kontenjanı aşanın yedek numarasını döner', () => {
    expect(waitlistNumber(64, 65)).toBe(1);
    expect(waitlistNumber(64, 67)).toBe(3);
  });

  it('kontenjansız turnuvada ve sıra numarası olmayan eski başvuruda undefined', () => {
    expect(waitlistNumber(undefined, 100)).toBeUndefined();
    expect(waitlistNumber(64, undefined)).toBeUndefined();
  });
});

describe('isOverLimit', () => {
  it('asil + yedek kontenjanını aşınca true', () => {
    expect(isOverLimit({ capacity: 64, waitlistCapacity: 20 }, 84)).toBe(false);
    expect(isOverLimit({ capacity: 64, waitlistCapacity: 20 }, 85)).toBe(true);
  });

  it('yedek kontenjanı 0 ise ilk yedek reddedilir', () => {
    expect(isOverLimit({ capacity: 64, waitlistCapacity: 0 }, 65)).toBe(true);
  });

  it('yedek kontenjanı ya da kontenjan boşsa sınır yok', () => {
    expect(isOverLimit({ capacity: 64, waitlistCapacity: null }, 500)).toBe(
      false,
    );
    expect(
      isOverLimit({ capacity: undefined, waitlistCapacity: 20 }, 500),
    ).toBe(false);
  });
});

describe('registrationStatus', () => {
  it('kontenjana göre Asil ya da Yedek N, kontenjansızda boş', () => {
    expect(registrationStatus(64, 10)).toBe('Asil');
    expect(registrationStatus(64, 67)).toBe('Yedek 3');
    expect(registrationStatus(undefined, 67)).toBeUndefined();
  });
});
