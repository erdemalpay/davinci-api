import { AssignmentCronService } from './assignment.cron.service';

jest.mock('./assignment.service', () => ({
  AssignmentService: class AssignmentService {},
}));

describe('AssignmentCronService', () => {
  let assignmentService: {
    processGameAssignmentReminders: jest.Mock;
  };
  let service: AssignmentCronService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    assignmentService = {
      processGameAssignmentReminders: jest.fn().mockResolvedValue({
        fiveDayReminders: 2,
        oneDayReminders: 1,
        managersInformed: 3,
        failures: 0,
      }),
    };
    service = new AssignmentCronService(assignmentService as never);
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
      assignmentService.processGameAssignmentReminders,
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
    assignmentService.processGameAssignmentReminders.mockRejectedValue(error);

    await expect(service.handleGameAssignmentReminders()).rejects.toBe(error);

    expect(errorSpy).toHaveBeenCalledWith(
      'Game assignment reminder cron failed',
      error.stack,
    );
  });
});
