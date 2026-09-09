jest.mock('../user/user.service', () => ({
  UserService: class UserService {},
}));
jest.mock('../notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));
jest.mock('../activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));
jest.mock('../shift/shift.service', () => ({
  ShiftService: class ShiftService {},
}));

import { NotificationEventType } from '../notification/notification.dto';
import { VisitSource } from './visit.dto';
import { VisitService } from './visit.service';

type OpenVisitFixture = {
  _id: number;
  user: { _id: string; name: string };
  location: { _id: number; name: string };
  date: string;
  startHour: string;
};

const makeVisit = (overrides: Partial<OpenVisitFixture> = {}) => ({
  _id: 1,
  user: { _id: 'ceren', name: 'Ceren' },
  location: { _id: 2, name: 'Neorama' },
  date: '2026-09-08',
  startHour: '13:00',
  ...overrides,
});

const makeShiftDay = (shift: {
  user: string[];
  shift: string;
  shiftEndHour?: string;
}) => [{ day: '2026-09-08', location: 2, shifts: [shift] }];

describe('VisitService.notifyUnfinishedVisits', () => {
  let visitModel: {
    find: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let notificationService: {
    findAllEventNotifications: jest.Mock;
    createNotification: jest.Mock;
  };
  let shiftService: { findQueryShifts: jest.Mock };
  let websocketGateway: { emitVisitChanged: jest.Mock };
  let service: VisitService;

  const givenOpenVisits = (visits: unknown[]) => {
    visitModel.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(visits),
    });
  };

  const givenShift = (shift: {
    user: string[];
    shift: string;
    shiftEndHour?: string;
  }) => shiftService.findQueryShifts.mockResolvedValue(makeShiftDay(shift));

  const updatesFor = (id: number) =>
    visitModel.findByIdAndUpdate.mock.calls.find((call) => call[0] === id)?.[1];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-08T22:30:00Z'));

    visitModel = {
      find: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    };
    notificationService = {
      findAllEventNotifications: jest.fn().mockResolvedValue([
        {
          event: NotificationEventType.UNFINISHEDVISIT,
          type: 'INFORMATION',
          createdBy: 'system',
          selectedUsers: ['manager'],
          selectedRoles: [1],
          selectedLocations: [2],
        },
      ]),
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    shiftService = { findQueryShifts: jest.fn().mockResolvedValue([]) };
    websocketGateway = { emitVisitChanged: jest.fn() };

    service = new VisitService(
      visitModel as never,
      {} as never,
      websocketGateway as never,
      {} as never,
      notificationService as never,
      shiftService as never,
      {} as never,
      {} as never,
    );
    givenOpenVisits([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['vardiya bitişi varsa onu yazar', '13:00', '13:00', '23:00', '23:00'],
    ['bitiş girişten önceyse fallback', '23:29', '12:00', '22:00', '01:10'],
    ['gece vardiyasında bitişi yazar', '14:15', '14:10', '00:10', '00:10'],
    ['gece vardiyasında erken giriş', '00:30', '19:00', '00:10', '01:10'],
  ])('%s', async (_case, startHour, shift, shiftEndHour, expected) => {
    givenOpenVisits([makeVisit({ startHour })]);
    givenShift({ user: ['ceren'], shift, shiftEndHour });

    await service.notifyUnfinishedVisits();

    expect(updatesFor(1).finishHour).toBe(expected);
  });

  it('kişinin o güne vardiyası yoksa 01:10 yazar', async () => {
    givenOpenVisits([makeVisit()]);
    givenShift({ user: ['baskaBiri'], shift: '13:00', shiftEndHour: '23:00' });

    await service.notifyUnfinishedVisits();

    expect(updatesFor(1).finishHour).toBe('01:10');
  });

  it('kapattığı kaydı auto kaynağıyla işaretler', async () => {
    givenOpenVisits([makeVisit()]);
    givenShift({ user: ['ceren'], shift: '13:00', shiftEndHour: '23:00' });

    await service.notifyUnfinishedVisits();

    expect(updatesFor(1)).toEqual({
      notificationSent: true,
      finishHour: '23:00',
      visitFinishSource: VisitSource.AUTO,
    });
  });

  it('vardiya sorgusu patlarsa kaydı 01:10 ile yine de kapatır', async () => {
    givenOpenVisits([makeVisit()]);
    shiftService.findQueryShifts.mockRejectedValue(new Error('redis down'));
    jest.spyOn(console, 'error').mockImplementation();

    await service.notifyUnfinishedVisits();

    expect(updatesFor(1).finishHour).toBe('01:10');
  });

  it('bugünün kayıtlarını hariç tutar, pencereyi Istanbul saatine göre kurar', async () => {
    await service.notifyUnfinishedVisits();

    expect(visitModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        finishHour: { $exists: false },
        date: { $gte: '2026-09-07', $lt: '2026-09-09' },
      }),
    );
  });

  it('açık kayıt yoksa hiçbir şey yapmaz', async () => {
    await service.notifyUnfinishedVisits();

    expect(visitModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(websocketGateway.emitVisitChanged).not.toHaveBeenCalled();
    expect(
      notificationService.findAllEventNotifications,
    ).not.toHaveBeenCalled();
  });

  it('birden fazla kaydı kapatır ve websocket olayını yalnızca bir kez yayar', async () => {
    givenOpenVisits([
      makeVisit({ _id: 1 }),
      makeVisit({ _id: 2, user: { _id: 'utku', name: 'Utku' } }),
    ]);

    const closed = await service.notifyUnfinishedVisits();

    expect(closed).toBe(2);
    expect(visitModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(websocketGateway.emitVisitChanged).toHaveBeenCalledTimes(1);
  });

  it('kapatmanın yanında yöneticiye ve personele bildirim göndermeyi sürdürür', async () => {
    givenOpenVisits([makeVisit()]);

    await service.notifyUnfinishedVisits();

    const messages = notificationService.createNotification.mock.calls.map(
      (call) => call[0].message,
    );
    expect(messages).toEqual([
      {
        key: 'UnfinishedVisit',
        params: {
          user: 'Ceren',
          location: 'Neorama',
          date: '2026-09-08',
          startHour: '13:00',
        },
      },
      {
        key: 'UnfinishedVisitEmployee',
        params: {
          location: 'Neorama',
          date: '2026-09-08',
          startHour: '13:00',
        },
      },
    ]);
    expect(
      notificationService.createNotification.mock.calls[1][0].selectedUsers,
    ).toEqual(['ceren']);
  });

  it.each([
    [
      'şablon silinmişse',
      () => notificationService.findAllEventNotifications.mockResolvedValue([]),
    ],
    [
      'bildirim servisi patlarsa',
      () =>
        notificationService.findAllEventNotifications.mockRejectedValue(
          new Error('notification service down'),
        ),
    ],
    [
      'bildirim gönderimi patlarsa',
      () =>
        notificationService.createNotification.mockRejectedValue(
          new Error('mail gateway down'),
        ),
    ],
  ])(
    '%s bildirim atmaz ama kaydı yine kapatır',
    async (_case, breakNotification) => {
      givenOpenVisits([makeVisit()]);
      givenShift({ user: ['ceren'], shift: '13:00', shiftEndHour: '23:00' });
      breakNotification();
      jest.spyOn(console, 'error').mockImplementation();

      await service.notifyUnfinishedVisits();

      expect(updatesFor(1)).toEqual({
        notificationSent: false,
        finishHour: '23:00',
        visitFinishSource: VisitSource.AUTO,
      });
    },
  );
});

describe('VisitService.toggleVisit (mevcut giriş/çıkış davranışı)', () => {
  let visitModel: { findOne: jest.Mock };
  let service: VisitService;
  let finishSpy: jest.SpyInstance;
  let createSpy: jest.SpyInstance;

  const user = { _id: 'ceren', name: 'Ceren' } as never;

  const givenLastVisit = (visit: unknown) => {
    visitModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(visit),
    });
  };

  const toggle = () =>
    (
      service as unknown as {
        toggleVisit: (
          u: unknown,
          l: number,
          s: VisitSource,
        ) => Promise<unknown>;
      }
    ).toggleVisit(user, 2, VisitSource.QR);

  beforeEach(() => {
    jest.useFakeTimers();
    visitModel = { findOne: jest.fn() };
    service = new VisitService(
      visitModel as never,
      {} as never,
      { emitVisitChanged: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    finishSpy = jest
      .spyOn(service, 'finish')
      .mockResolvedValue({ _id: 1 } as never);
    createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ _id: 2 } as never);
    givenLastVisit(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('gece vardiyası: 00:10da okutunca dünkü açık kaydı çıkış olarak kapatır', async () => {
    jest.setSystemTime(new Date('2026-09-08T21:10:00Z'));
    givenLastVisit({ _id: 7, date: '2026-09-08', startHour: '19:00' });

    const result = await toggle();

    expect(result).toEqual({ action: 'exit', visit: { _id: 1 } });
    expect(finishSpy).toHaveBeenCalledWith(user, 7, '00:10', VisitSource.QR);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('dünkü kayıt otomatik kapatıldıysa ertesi sabahki okutma giriş sayılır', async () => {
    jest.setSystemTime(new Date('2026-09-09T06:25:00Z'));
    givenLastVisit({
      _id: 7,
      date: '2026-09-08',
      startHour: '19:00',
      finishHour: '23:00',
      visitFinishSource: VisitSource.AUTO,
    });

    const result = await toggle();

    expect(result).toEqual({ action: 'entry', visit: { _id: 2 } });
    expect(createSpy).toHaveBeenCalledWith(user, {
      location: 2,
      date: '2026-09-09',
      startHour: '09:25',
      visitStartSource: VisitSource.QR,
    });
    expect(finishSpy).not.toHaveBeenCalled();
  });

  it('aynı gün ikinci okutma çıkış olur', async () => {
    jest.setSystemTime(new Date('2026-09-09T20:00:00Z'));
    givenLastVisit({ _id: 8, date: '2026-09-09', startHour: '13:00' });

    const result = await toggle();

    expect(result).toEqual({ action: 'exit', visit: { _id: 1 } });
    expect(finishSpy).toHaveBeenCalledWith(user, 8, '23:00', VisitSource.QR);
  });

  it('hiç kayıt yoksa giriş açar', async () => {
    jest.setSystemTime(new Date('2026-09-09T10:00:00Z'));

    const result = await toggle();

    expect(result).toEqual({ action: 'entry', visit: { _id: 2 } });
    expect(createSpy).toHaveBeenCalledWith(user, {
      location: 2,
      date: '2026-09-09',
      startHour: '13:00',
      visitStartSource: VisitSource.QR,
    });
  });
});
