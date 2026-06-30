import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { AssignmentStatusEnum, AssignmentTypeEnum } from './assignment.dto';
import { AssignmentReminderService } from './assignment.reminder.service';

jest.mock('../notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));

describe('AssignmentReminderService', () => {
  const now = new Date('2026-06-30T06:00:00.000Z');

  let assignments: Record<string, unknown>[];
  let assignmentModel: {
    find: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let notificationService: {
    createNotification: jest.Mock;
  };
  let service: AssignmentReminderService;

  beforeEach(() => {
    assignments = [];
    assignmentModel = {
      find: jest.fn().mockImplementation(() => ({
        lean: () => ({
          exec: jest.fn().mockResolvedValue(assignments),
        }),
      })),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    };
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ _id: 900 }),
    };
    service = new AssignmentReminderService(
      assignmentModel as never,
      notificationService as never,
    );
    jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation();
  });

  it('sends and marks a five-day reminder for the assigned user', async () => {
    assignments.push({
      _id: 101,
      title: 'Learn Azul',
      assignedBy: 'manager-1',
      assignedTo: 'user-1',
      dueDate: new Date('2026-07-05T12:00:00.000Z'),
    });

    const result = await service.processGameAssignmentReminders(now);

    expect(notificationService.createNotification).toHaveBeenCalledWith({
      type: NotificationType.INFORMATION,
      selectedUsers: ['user-1'],
      seenBy: [],
      event: NotificationEventType.GAMEASSIGNMENTREMINDER,
      message: {
        key: 'GameAssignmentDueReminder',
        params: {
          assignmentId: 101,
          title: 'Learn Azul',
          dueDate: '2026-07-05T12:00:00.000Z',
          daysRemaining: 5,
        },
      },
    });
    expect(assignmentModel.findByIdAndUpdate).toHaveBeenCalledWith(101, {
      fiveDayReminderSentAt: now,
    });
    expect(result).toEqual({
      fiveDayReminders: 1,
      oneDayReminders: 0,
      managersInformed: 0,
      failures: 0,
    });
  });

  it('sends and marks a one-day reminder for the assigned user', async () => {
    assignments.push({
      _id: 102,
      title: 'Learn Catan',
      assignedBy: 'manager-1',
      assignedTo: 'user-2',
      dueDate: new Date('2026-07-01T12:00:00.000Z'),
    });

    const result = await service.processGameAssignmentReminders(now);

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.INFORMATION,
        selectedUsers: ['user-2'],
        event: NotificationEventType.GAMEASSIGNMENTREMINDER,
        message: expect.objectContaining({
          params: expect.objectContaining({ daysRemaining: 1 }),
        }),
      }),
    );
    expect(assignmentModel.findByIdAndUpdate).toHaveBeenCalledWith(102, {
      oneDayReminderSentAt: now,
    });
    expect(result.oneDayReminders).toBe(1);
  });

  it('informs assignedBy once after the deadline without changing status', async () => {
    assignments.push({
      _id: 103,
      title: 'Learn Wingspan',
      assignedBy: 'manager-2',
      assignedTo: 'user-3',
      dueDate: new Date('2026-06-30T05:59:59.000Z'),
      status: AssignmentStatusEnum.ASSIGNED,
    });

    const result = await service.processGameAssignmentReminders(now);

    expect(notificationService.createNotification).toHaveBeenCalledWith({
      type: NotificationType.WARNING,
      selectedUsers: ['manager-2'],
      seenBy: [],
      event: NotificationEventType.GAMEASSIGNMENTOVERDUE,
      message: {
        key: 'GameAssignmentOverdue',
        params: {
          assignmentId: 103,
          title: 'Learn Wingspan',
          assignedTo: 'user-3',
          dueDate: '2026-06-30T05:59:59.000Z',
        },
      },
    });
    expect(assignmentModel.findByIdAndUpdate).toHaveBeenCalledWith(103, {
      managerInformedAt: now,
    });
    expect(
      assignmentModel.findByIdAndUpdate.mock.calls[0][1],
    ).not.toHaveProperty('status');
    expect(result.managersInformed).toBe(1);
  });

  it('queries only eligible assigned game assignments with unsent branches', async () => {
    await service.processGameAssignmentReminders(now);

    expect(assignmentModel.find).toHaveBeenCalledWith({
      assignmentType: AssignmentTypeEnum.GAME_LEARNING,
      status: AssignmentStatusEnum.ASSIGNED,
      dueDate: { $exists: true },
      $or: [
        {
          dueDate: {
            $gte: new Date('2026-07-04T21:00:00.000Z'),
            $lt: new Date('2026-07-05T21:00:00.000Z'),
          },
          fiveDayReminderSentAt: { $exists: false },
        },
        {
          dueDate: {
            $gte: new Date('2026-06-30T21:00:00.000Z'),
            $lt: new Date('2026-07-01T21:00:00.000Z'),
          },
          oneDayReminderSentAt: { $exists: false },
        },
        {
          dueDate: { $lt: now },
          managerInformedAt: { $exists: false },
        },
      ],
    });
  });

  it('does not mark delivery when notifications are disabled', async () => {
    assignments.push({
      _id: 104,
      title: 'Learn Dixit',
      assignedBy: 'manager-2',
      assignedTo: 'user-4',
      dueDate: new Date('2026-07-01T09:00:00.000Z'),
    });
    notificationService.createNotification.mockResolvedValue(null);

    const result = await service.processGameAssignmentReminders(now);

    expect(assignmentModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(result.oneDayReminders).toBe(0);
    expect(result.failures).toBe(0);
  });

  it('continues after a notification failure and leaves the failed timestamp unset', async () => {
    assignments.push(
      {
        _id: 105,
        title: 'Learn First Game',
        assignedBy: 'manager-3',
        assignedTo: 'user-5',
        dueDate: new Date('2026-07-05T10:00:00.000Z'),
      },
      {
        _id: 106,
        title: 'Learn Second Game',
        assignedBy: 'manager-3',
        assignedTo: 'user-6',
        dueDate: new Date('2026-07-01T10:00:00.000Z'),
      },
    );
    notificationService.createNotification
      .mockRejectedValueOnce(new Error('notification unavailable'))
      .mockResolvedValueOnce({ _id: 901 });

    const result = await service.processGameAssignmentReminders(now);

    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(assignmentModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(assignmentModel.findByIdAndUpdate).toHaveBeenCalledWith(106, {
      oneDayReminderSentAt: now,
    });
    expect(result).toEqual({
      fiveDayReminders: 0,
      oneDayReminders: 1,
      managersInformed: 0,
      failures: 1,
    });
  });
});
