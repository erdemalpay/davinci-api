import { AssignmentSchema } from './assignment.schema';

describe('AssignmentSchema reminder delivery state', () => {
  it.each([
    'fiveDayReminderSentAt',
    'oneDayReminderSentAt',
    'managerInformedAt',
  ])('defines %s as a date', (path) => {
    expect(AssignmentSchema.path(path)?.instance).toBe('Date');
  });
});
