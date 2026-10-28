import {
  ConfirmationStatus,
  ListStatus,
} from './schemas/tournament-registration.schema';
import {
  isOverLimit,
  nextPositions,
  positionFromSequence,
  publishedPosition,
  statusLabel,
} from './tournament.waitlist';

const MAIN = { listStatus: ListStatus.MAIN };
const waitlist = (n: number) => ({
  listStatus: ListStatus.WAITLIST,
  waitlist: n,
});

describe('positionFromSequence', () => {
  it('ilk kontenjan kadar kayıt asil, sonrakiler sırayla yedek', () => {
    expect(positionFromSequence({ capacity: 64 }, 64)).toEqual(MAIN);
    expect(positionFromSequence({ capacity: 64 }, 67)).toEqual(waitlist(3));
  });

  it('kontenjansız turnuvada ve sıra numarası olmayan eski başvuruda yer yok', () => {
    expect(positionFromSequence({ capacity: undefined }, 100)).toBeUndefined();
    expect(positionFromSequence({ capacity: 64 }, undefined)).toBeUndefined();
  });

  it('liste güncellendikten sonra gelen önce boş asil yerlerine, sonra listenin sonuna eklenir', () => {
    const anchor = { sequence: 90, freeMain: 0, waitlistCount: 10 };
    expect(
      positionFromSequence({ capacity: 64, waitlistAnchor: anchor }, 91),
    ).toEqual(waitlist(11));
    const withFree = { sequence: 70, freeMain: 2, waitlistCount: 0 };
    expect(
      positionFromSequence({ capacity: 64, waitlistAnchor: withFree }, 72),
    ).toEqual(MAIN);
    expect(
      positionFromSequence({ capacity: 64, waitlistAnchor: withFree }, 73),
    ).toEqual(waitlist(1));
  });
});

describe('publishedPosition', () => {
  it('bildirilen yer varsa onu, yoksa kayıt sırasından hesaplananı döner', () => {
    expect(
      publishedPosition(
        { capacity: 64 },
        { sequence: 70, listStatus: ListStatus.MAIN },
      ),
    ).toEqual(MAIN);
    expect(publishedPosition({ capacity: 64 }, { sequence: 70 })).toEqual(
      waitlist(6),
    );
  });
});

describe('isOverLimit', () => {
  it('yedek numarası yedek kontenjanını aşınca true', () => {
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

  it('liste kısaldıysa sınır güncel yedek numarasına göre uygulanır', () => {
    const waitlistAnchor = { sequence: 90, freeMain: 0, waitlistCount: 5 };
    expect(
      isOverLimit({ capacity: 64, waitlistCapacity: 20, waitlistAnchor }, 105),
    ).toBe(false);
  });
});

describe('statusLabel', () => {
  it('Asil ya da Yedek N, listede yoksa boş', () => {
    expect(statusLabel(MAIN)).toBe('Asil');
    expect(statusLabel(waitlist(3))).toBe('Yedek 3');
    expect(statusLabel({ listStatus: ListStatus.WITHDRAWN })).toBeUndefined();
    expect(statusLabel(undefined)).toBeUndefined();
  });
});

describe('nextPositions', () => {
  // Kontenjan 2: 1-2 asil, 3-5 yedek
  const registration = (_id: number, extra = {}) => ({
    _id,
    sequence: _id,
    confirmationStatus: ConfirmationStatus.PENDING,
    ...extra,
  });
  const declined = { confirmationStatus: ConfirmationStatus.DECLINED };
  const next = (registrations: ReturnType<typeof registration>[]) =>
    Object.fromEntries(nextPositions({ capacity: 2 }, registrations));

  it('değişiklik yoksa herkes bildirilen yerinde kalır', () => {
    expect(next([1, 2, 3, 4].map((id) => registration(id)))).toEqual({
      1: MAIN,
      2: MAIN,
      3: waitlist(1),
      4: waitlist(2),
    });
  });

  it('asil katılmayınca ilk yedek asile geçer, diğerleri birer sıra ilerler', () => {
    expect(
      next([
        registration(1, declined),
        registration(2),
        registration(3),
        registration(4),
        registration(5),
      ]),
    ).toEqual({
      1: { listStatus: ListStatus.WITHDRAWN },
      2: MAIN,
      3: MAIN,
      4: waitlist(1),
      5: waitlist(2),
    });
  });

  it('elle asil yapılan yedeğin önündekiler yerinde kalır, arkasındakiler ilerler', () => {
    expect(
      next([
        registration(1),
        registration(2),
        registration(3),
        registration(4, { isManualMain: true }),
        registration(5),
      ]),
    ).toEqual({
      1: MAIN,
      2: MAIN,
      3: waitlist(1),
      4: MAIN,
      5: waitlist(2),
    });
  });

  it('kontenjan fazla asil varsa boşalan yer yedeğe gitmez', () => {
    expect(
      next([
        registration(1, declined),
        registration(2),
        registration(3, { isManualMain: true, listStatus: ListStatus.MAIN }),
        registration(4),
      ]),
    ).toEqual({
      1: { listStatus: ListStatus.WITHDRAWN },
      2: MAIN,
      3: MAIN,
      4: waitlist(1),
    });
  });

  it('bildirilmiş asil kontenjan düşse de yedeğe inmez', () => {
    expect(
      Object.fromEntries(
        nextPositions({ capacity: 1 }, [
          registration(1, { listStatus: ListStatus.MAIN }),
          registration(2, { listStatus: ListStatus.MAIN }),
          registration(3, { listStatus: ListStatus.WAITLIST, waitlist: 1 }),
        ]),
      ),
    ).toEqual({ 1: MAIN, 2: MAIN, 3: waitlist(1) });
  });

  it('yeri verildikten sonra iptali geri alınan listenin sonuna eklenir', () => {
    expect(
      next([
        registration(1, {
          listStatus: ListStatus.WITHDRAWN,
          requeuedAt: new Date('2026-11-01'),
        }),
        registration(2, { listStatus: ListStatus.MAIN }),
        registration(3, { listStatus: ListStatus.MAIN }),
        registration(4, { listStatus: ListStatus.WAITLIST, waitlist: 1 }),
      ]),
    ).toEqual({ 1: waitlist(2), 2: MAIN, 3: MAIN, 4: waitlist(1) });
  });

  it('henüz bildirilmemiş iptal geri alınınca kişi eski yerinde kalır', () => {
    expect(next([1, 2, 3].map((id) => registration(id)))[1]).toEqual(MAIN);
  });

  it('kontenjansız turnuvada kimsenin yeri yok', () => {
    expect(nextPositions({ capacity: undefined }, [registration(1)]).size).toBe(
      0,
    );
  });
});
