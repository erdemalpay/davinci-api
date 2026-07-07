import { AssignmentCronService } from './assignment.cron.service';

jest.mock('./assignment.reminder.service', () => ({
  AssignmentReminderService: class AssignmentReminderService {},
}));

jest.mock('./assignment.service', () => ({
  AssignmentService: class AssignmentService {},
}));

describe('AssignmentCronService', () => {
  let assignmentReminderService: {
    processGameAssignmentReminders: jest.Mock;
  };
  let assignmentService: {
    markOverdueAssignments: jest.Mock;
  };
  let service: AssignmentCronService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    assignmentReminderService = {
      processGameAssignmentReminders: jest.fn().mockResolvedValue({
        fiveDayReminders: 2,
        oneDayReminders: 1,
        managersInformed: 3,
        failures: 0,
      }),
    };
    assignmentService = {
      markOverdueAssignments: jest.fn().mockResolvedValue({
        matchedCount: 2,
        modifiedCount: 2,
      }),
    };
    service = new AssignmentCronService(
      assignmentReminderService as never,
      assignmentService as never,
    );
    logSpy = jest
      .spyOn(
        (service as unknown as { logger: { log: () => void } }).logger,
        'log',
      )
      .mockImplementation();
    errorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation();
  });

  it('runs daily in Istanbul and delegates reminder processing', async () => {
    const result = await service.handleGameAssignmentReminders();
    const cronOptions = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      service.handleGameAssignmentReminders,
    );

    expect(cronOptions).toEqual({
      cronTime: '0 0 1 * * *',
      timeZone: 'Europe/Istanbul',
    });
    expect(
      assignmentReminderService.processGameAssignmentReminders,
    ).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      'Game assignment reminders completed: 2 five-day, 1 one-day, 3 manager, 0 failed',
    );
    expect(result).toEqual({
      fiveDayReminders: 2,
      oneDayReminders: 1,
      managersInformed: 3,
      failures: 0,
    });
  });

  it('logs and rethrows workflow errors', async () => {
    const error = new Error('database unavailable');
    assignmentReminderService.processGameAssignmentReminders.mockRejectedValue(
      error,
    );

    await expect(service.handleGameAssignmentReminders()).rejects.toBe(error);

    expect(errorSpy).toHaveBeenCalledWith(
      'Game assignment reminder cron failed',
      error.stack,
    );
  });

  it('runs daily in Istanbul and marks overdue assignments', async () => {
    const result = await service.handleMarkOverdueAssignments();
    const cronOptions = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      service.handleMarkOverdueAssignments,
    );

    expect(cronOptions).toEqual({
      cronTime: '0 55 23 * * *',
      timeZone: 'Europe/Istanbul',
    });
    expect(assignmentService.markOverdueAssignments).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      'Mark overdue assignments completed: 2/2 updated',
    );
    expect(result).toEqual({ matchedCount: 2, modifiedCount: 2 });
  });

  it('logs and rethrows mark-overdue errors', async () => {
    const error = new Error('database unavailable');
    assignmentService.markOverdueAssignments.mockRejectedValue(error);

    await expect(service.handleMarkOverdueAssignments()).rejects.toBe(error);

    expect(errorSpy).toHaveBeenCalledWith(
      'Mark overdue assignments cron failed',
      error.stack,
    );
  });
});
