jest.mock('../user/user.service', () => ({
  UserService: class UserService {},
}));
jest.mock('../notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));
jest.mock('../activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));
jest.mock('../location/location.service', () => ({
  LocationService: class LocationService {},
}));

import { HttpException } from '@nestjs/common';
import { BreakService } from './break.service';

describe('BreakService.create', () => {
  const dto = {
    user: 'ali',
    location: 1,
    date: '2026-10-05',
    startHour: '14:00',
  };

  // Mongoose-like query resolving to `rows`.
  const rowsQuery = (rows: unknown) => ({
    select: () => ({ lean: async () => rows }),
  });

  function build(
    hasAssignedCall: boolean,
    {
      othersOnBreak = [] as string[],
      inCafe = [] as string[],
      outsideOperation = [] as string[],
      hasNotificationEvent = true,
    } = {},
  ) {
    const breakModel = {
      findOne: jest.fn(async () => null),
      find: jest.fn(() => rowsQuery(othersOnBreak.map((user) => ({ user })))),
      create: jest.fn(async (doc: unknown) => ({ ...(doc as object), _id: 1 })),
    };
    const visitModel = {
      find: jest.fn(() => rowsQuery(inCafe.map((user) => ({ user })))),
    };
    const shiftModel = {
      findOne: jest.fn(() =>
        rowsQuery({ shifts: [{ outsideOperationUsers: outsideOperation }] }),
      ),
    };
    const notificationService = {
      findAllEventNotifications: jest.fn(async () =>
        hasNotificationEvent
          ? [{ event: 'CONCURRENTBREAK', type: 'WARNING' }]
          : [],
      ),
      createNotification: jest.fn(),
    };
    const buttonCallModel = {
      exists: jest.fn(async () => (hasAssignedCall ? { _id: 5 } : null)),
    };
    const service = new BreakService(
      breakModel as never,
      { emitBreakChanged: jest.fn() } as never,
      { findLocationById: jest.fn(async () => null) } as never,
      { findById: jest.fn(async () => null) } as never,
      { addActivity: jest.fn() } as never,
      notificationService as never,
      { emit: jest.fn() } as never,
      buttonCallModel as never,
      {} as never,
      {} as never,
      visitModel as never,
      shiftModel as never,
    );
    return { service, breakModel, buttonCallModel, notificationService };
  }

  it('refuses a break while a game master or service call is assigned', async () => {
    const { service, breakModel, buttonCallModel } = build(true);

    await expect(service.create(dto as never)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(buttonCallModel.exists).toHaveBeenCalledWith({
      assignedTo: 'ali',
      type: { $in: ['GAMEMASTERCALL', 'ORDERCALL'] },
      date: '2026-10-05',
      finishHour: { $exists: false },
    });
    expect(breakModel.create).not.toHaveBeenCalled();
  });

  it('starts a break when no call is assigned', async () => {
    const { service, breakModel } = build(false);

    await service.create(dto as never);

    expect(breakModel.create).toHaveBeenCalledWith({ ...dto, type: 'BREAK' });
  });

  it('starts a busy state without the "others on break" check', async () => {
    const { service, breakModel } = build(false);

    await service.create({ ...dto, type: 'TAKING_PAYMENT' } as never);

    expect(breakModel.find).not.toHaveBeenCalled();
    expect(breakModel.create).toHaveBeenCalledWith({
      ...dto,
      type: 'TAKING_PAYMENT',
    });
  });

  it('keeps the trimmed note of "other"', async () => {
    const { service, breakModel } = build(false);

    await service.create({ ...dto, type: 'OTHER', note: '  Depo ' } as never);

    expect(breakModel.create).toHaveBeenCalledWith({
      ...dto,
      type: 'OTHER',
      note: 'Depo',
    });
  });
});

describe('BreakService concurrent break warning', () => {
  // Same setup as above, reused through BreakService.create.
  const dto = {
    user: 'ali',
    location: 1,
    date: '2026-10-05',
    startHour: '14:00',
  };
  const rowsQuery = (rows: unknown) => ({
    select: () => ({ lean: async () => rows }),
  });
  function build(
    othersOnBreak: string[],
    inCafe: string[],
    outside: string[] = [],
  ) {
    const notificationService = {
      findAllEventNotifications: jest.fn(async () => [
        { event: 'CONCURRENTBREAK', type: 'WARNING' },
      ]),
      createNotification: jest.fn(),
    };
    const breakModel = {
      findOne: jest.fn(async () => null),
      find: jest.fn(() => rowsQuery(othersOnBreak.map((user) => ({ user })))),
      create: jest.fn(async (doc: unknown) => ({ ...(doc as object), _id: 1 })),
    };
    const service = new BreakService(
      breakModel as never,
      { emitBreakChanged: jest.fn() } as never,
      { findLocationById: jest.fn(async () => null) } as never,
      { findById: jest.fn(async () => null) } as never,
      { addActivity: jest.fn() } as never,
      notificationService as never,
      { emit: jest.fn() } as never,
      { exists: jest.fn(async () => null) } as never,
      {} as never,
      {} as never,
      {
        find: jest.fn(() => rowsQuery(inCafe.map((user) => ({ user })))),
      } as never,
      {
        findOne: jest.fn(() =>
          rowsQuery({ shifts: [{ outsideOperationUsers: outside }] }),
        ),
      } as never,
    );
    return { service, notificationService };
  }

  it('warns with fewer than 4 in the cafe and someone else on a break', async () => {
    const { service, notificationService } = build(
      ['ayse'],
      ['ali', 'ayse', 'mert'],
    );

    await service.create(dto as never);

    expect(notificationService.createNotification).toHaveBeenCalled();
  });

  it('does not warn with 4 in the cafe and one other on a break', async () => {
    const { service, notificationService } = build(
      ['ayse'],
      ['ali', 'ayse', 'mert', 'can'],
    );

    await service.create(dto as never);

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('warns with 4 in the cafe and two others on a break', async () => {
    const { service, notificationService } = build(
      ['ayse', 'mert'],
      ['ali', 'ayse', 'mert', 'can'],
    );

    await service.create(dto as never);

    expect(notificationService.createNotification).toHaveBeenCalled();
  });

  it('leaves people outside operation out', async () => {
    // Kemal's break doesn't count, and he doesn't count as in the cafe.
    const { service, notificationService } = build(
      ['kemal'],
      ['ali', 'ayse', 'mert', 'kemal'],
      ['kemal'],
    );

    await service.create(dto as never);

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('warns for a break started by declining a call', async () => {
    const { service, notificationService } = build(['ayse'], ['ali', 'ayse']);

    await service.handleBusyStateStartedOnDecline({
      breakRecord: { user: 'ali', location: 1, date: dto.date, type: 'BREAK' },
    });

    expect(notificationService.createNotification).toHaveBeenCalled();
  });

  it('does not warn for other busy states started by declining', async () => {
    const { service, notificationService } = build(['ayse'], ['ali', 'ayse']);

    await service.handleBusyStateStartedOnDecline({
      breakRecord: { user: 'ali', location: 1, date: dto.date, type: 'WC' },
    });

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });
});

describe('BreakService.getStateSummary', () => {
  const find = (rows: unknown[]) => ({
    find: jest.fn(() => ({
      select: () => ({ lean: async () => rows }),
    })),
  });

  it('adds up minutes per person per state', async () => {
    const breakModel = find([
      { user: 'ali', type: 'BREAK', startHour: '10:00', finishHour: '10:15' },
      { user: 'ali', startHour: '12:00', finishHour: '12:10' },
      {
        user: 'ali',
        type: 'TAKING_PAYMENT',
        startHour: '13:00',
        finishHour: '13:05',
      },
      { user: 'ayse', type: 'OTHER', startHour: '11:00', finishHour: '11:30' },
    ]);
    const gameplayTimeModel = find([
      { user: 'ali', startHour: '14:00:00', finishHour: '14:20:00' },
    ]);
    const middlemanModel = find([
      { user: 'ayse', startHour: '15:00', finishHour: '16:00' },
    ]);
    const service = new BreakService(
      breakModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      gameplayTimeModel as never,
      middlemanModel as never,
      {} as never,
      {} as never,
    );

    const summary = await service.getStateSummary('2020-01-01', 1);
    const byUser = Object.fromEntries(summary.map((row) => [row.user, row]));

    expect(breakModel.find).toHaveBeenCalledWith({
      date: '2020-01-01',
      location: 1,
    });
    expect(byUser.ali.minutes).toEqual({
      BREAK: 25,
      TAKING_PAYMENT: 5,
      EXPLAINING: 20,
    });
    expect(byUser.ali.totalMinutes).toBe(50);
    expect(byUser.ayse.minutes).toEqual({ OTHER: 30, MIDDLEMAN: 60 });
  });

  it('counts a record still open on a past day until the end of the day', async () => {
    const service = new BreakService(
      find([{ user: 'ali', type: 'BREAK', startHour: '23:00' }]) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      find([]) as never,
      find([]) as never,
      {} as never,
      {} as never,
    );

    const [row] = await service.getStateSummary('2020-01-01');

    expect(row.minutes).toEqual({ BREAK: 59 });
  });
});
