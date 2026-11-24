import { MailType } from '../mail/mail.schema';
import { getRequiredMailTemplateParameters } from '../mail/templates/mail-templates';
import {
  bookableRange,
  BookedEvent,
  dayAvailability,
  eventWindow,
  istanbulToday,
  remainingSeats,
  timeProblem,
} from './group-event.availability';

const neoramaHours = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
].map((day) => ({ day, openingTime: '12:00', closingTime: '23:59' }));

const event = (over: Partial<BookedEvent>): BookedEvent => ({
  date: '2026-12-02',
  startTime: '14:00',
  endTime: '17:00',
  participantCount: 40,
  status: 'approved',
  ...over,
});

describe('group event availability', () => {
  it('uses opening hours on weekdays (23:59 closes at 24:00)', () => {
    expect(eventWindow('2026-12-02', neoramaHours)).toEqual({
      open: '12:00',
      close: '24:00',
    });
  });

  it('uses 10:00-14:00 on weekends', () => {
    expect(eventWindow('2026-12-05', neoramaHours)).toEqual({
      open: '10:00',
      close: '14:00',
    });
    expect(eventWindow('2026-12-06', neoramaHours)).toEqual({
      open: '10:00',
      close: '14:00',
    });
  });

  it('has no window on a closed weekday', () => {
    const hours = neoramaHours.map((h) =>
      h.day === 'Wednesday' ? { ...h, isClosed: true } : h,
    );
    expect(eventWindow('2026-12-02', hours)).toBeNull();
  });

  it('counts approved seats per hour and lists pending separately', () => {
    const day = dayAvailability(
      '2026-12-02',
      { open: '12:00', close: '18:00' },
      [
        event({}),
        event({ startTime: '15:00', endTime: '16:00', participantCount: 30 }),
        event({ status: 'pending', participantCount: 20 }),
        event({ status: 'rejected', participantCount: 50 }),
        event({ date: '2026-12-03', participantCount: 90 }),
      ],
    );
    expect(day.hours).toEqual([
      { hour: '12:00', remaining: 100, pending: 0 },
      { hour: '13:00', remaining: 100, pending: 0 },
      { hour: '14:00', remaining: 60, pending: 20 },
      { hour: '15:00', remaining: 30, pending: 20 },
      { hour: '16:00', remaining: 60, pending: 20 },
      { hour: '17:00', remaining: 100, pending: 0 },
    ]);
  });

  it('remaining seats is the tightest hour of the range', () => {
    const events = [
      event({}),
      event({ startTime: '16:00', endTime: '18:00', participantCount: 50 }),
    ];
    expect(remainingSeats('2026-12-02', '12:00', '15:00', events)).toBe(60);
    expect(remainingSeats('2026-12-02', '15:00', '18:00', events)).toBe(10);
    expect(remainingSeats('2026-12-02', '18:00', '20:00', events)).toBe(100);
  });

  it('ignores the event being approved itself', () => {
    const events = [event({ _id: 7, participantCount: 100 })];
    expect(remainingSeats('2026-12-02', '14:00', '17:00', events, 100, 7)).toBe(
      100,
    );
  });

  it('rejects times outside the window or not on the hour', () => {
    const window = { open: '10:00', close: '14:00' };
    expect(timeProblem(window, '10:00', '14:00')).toBeNull();
    expect(timeProblem(window, '09:00', '12:00')).toMatch(/between/);
    expect(timeProblem(window, '12:00', '15:00')).toMatch(/between/);
    expect(timeProblem(window, '10:30', '12:00')).toMatch(/hour/);
    expect(timeProblem(window, '12:00', '12:00')).toMatch(/after/);
    expect(timeProblem(null, '12:00', '14:00')).toMatch(/does not take/);
    expect(
      timeProblem({ open: '12:00', close: '24:00' }, '20:00', '24:00'),
    ).toBeNull();
  });

  it('books from tomorrow (Istanbul) up to 90 days', () => {
    // 22:30 UTC on 30 Nov is already 1 Dec in Istanbul
    const today = istanbulToday(new Date('2026-11-30T22:30:00Z'));
    expect(today).toBe('2026-12-01');
    expect(bookableRange(today)).toEqual({
      from: '2026-12-02',
      to: '2027-03-01',
    });
  });
});

describe('group event email parameters', () => {
  it('lists the required template variables', () => {
    expect(
      getRequiredMailTemplateParameters(MailType.GROUP_EVENT_UPDATE),
    ).toEqual([
      'contactName',
      'headline',
      'message',
      'organization',
      'eventDate',
      'eventTime',
      'participantCount',
    ]);
  });
});
