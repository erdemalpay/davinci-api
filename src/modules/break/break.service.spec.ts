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

  function build(hasAssignedCall: boolean) {
    const breakModel = {
      findOne: jest.fn(async () => null),
      countDocuments: jest.fn(async () => 0),
      create: jest.fn(async (doc: unknown) => ({ ...(doc as object), _id: 1 })),
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
      {
        findAllEventNotifications: jest.fn(async () => []),
        createNotification: jest.fn(),
      } as never,
      { emit: jest.fn() } as never,
      buttonCallModel as never,
      {} as never,
      {} as never,
    );
    return { service, breakModel, buttonCallModel };
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

    expect(breakModel.countDocuments).not.toHaveBeenCalled();
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
    );

    const [row] = await service.getStateSummary('2020-01-01');

    expect(row.minutes).toEqual({ BREAK: 59 });
  });
});
