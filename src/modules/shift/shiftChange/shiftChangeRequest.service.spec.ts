jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { NotificationEventType } from '../../notification/notification.dto';
import { ShiftChangeStatus } from './shiftChangeRequest.enums';
import { ShiftChangeRequestService } from './shiftChangeRequest.service';

describe('ShiftChangeRequestService rejection notifications', () => {
  const buildService = () => {
    const request = {
      _id: 7,
      type: 'SWAP',
      status: ShiftChangeStatus.PENDING,
      requesterId: 'ceren',
      targetUserId: 'can',
      save: jest.fn(),
    };
    const notificationService = {
      findAllEventNotifications: jest.fn().mockResolvedValue([
        {
          event: NotificationEventType.SHIFTCHANGEREJECTED,
          type: 'WARNING',
          createdBy: 'system',
          selectedUsers: [],
          selectedRoles: [3, 4, 11, 1],
          selectedLocations: [],
        },
      ]),
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ShiftChangeRequestService(
      { findById: jest.fn().mockResolvedValue(request) } as never,
      {} as never,
      {} as never,
      notificationService as never,
      { findById: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      { emitShiftChangeRequestChanged: jest.fn() } as never,
      { addActivity: jest.fn() } as never,
    );
    const sent = () =>
      notificationService.createNotification.mock.calls.map(([dto]) => ({
        key: dto.message.key,
        selectedUsers: dto.selectedUsers,
        selectedRoles: dto.selectedRoles,
        isPersonal: dto.isPersonal,
      }));
    return { service, sent };
  };

  it('tells only the requester and the target when a manager rejects', async () => {
    const { service, sent } = buildService();

    await service.rejectByManager(7, 'kemal', {} as never);

    expect(sent()).toEqual([
      {
        key: 'ShiftChangeRejectedByManager',
        selectedUsers: ['ceren'],
        selectedRoles: [],
        isPersonal: true,
      },
      {
        key: 'ShiftChangeRejectedByManager',
        selectedUsers: ['can'],
        selectedRoles: [],
        isPersonal: true,
      },
    ]);
  });

  it('tells only the requester when the target rejects', async () => {
    const { service, sent } = buildService();

    await service.rejectByTargetUser(7, 'can');

    expect(sent()).toEqual([
      {
        key: 'ShiftChangeRejectedByTarget',
        selectedUsers: ['ceren'],
        selectedRoles: [],
        isPersonal: true,
      },
    ]);
  });
});
