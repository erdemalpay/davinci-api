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

  it('refuses a break while a game master call is assigned', async () => {
    const { service, breakModel, buttonCallModel } = build(true);

    await expect(service.create(dto as never)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(buttonCallModel.exists).toHaveBeenCalledWith({
      assignedTo: 'ali',
      type: 'GAMEMASTERCALL',
      date: '2026-10-05',
      finishHour: { $exists: false },
    });
    expect(breakModel.create).not.toHaveBeenCalled();
  });

  it('starts a break when no call is assigned', async () => {
    const { service, breakModel } = build(false);

    await service.create(dto as never);

    expect(breakModel.create).toHaveBeenCalledWith(dto);
  });
});
