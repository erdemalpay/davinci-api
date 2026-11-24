// Pure rules for when groups can hold an event and how many seats are left.

export const GROUP_EVENT_CAPACITY = 100;
export const GROUP_EVENT_LOCATION = 2; // Neorama
export const BOOKING_HORIZON_DAYS = 90;
export const WEEKEND_WINDOW = { open: '10:00', close: '14:00' };
// Latest hour a weekday event may start (it can run on until closing)
export const WEEKDAY_LAST_START = '22:00';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type DailyHoursLike = {
  day: string;
  openingTime?: string;
  closingTime?: string;
  isClosed?: boolean;
};

// lastStart: latest hour an event may start on that day
export type Window = { open: string; close: string; lastStart: string };

export type BookedEvent = {
  _id?: number;
  date: string;
  startTime: string;
  endTime: string;
  participantCount: number;
  status: string;
};

export type HourAvailability = {
  hour: string;
  remaining: number;
  pending: number;
};

export type DayAvailability = {
  date: string;
  open: string;
  close: string;
  lastStart: string;
  hours: HourAvailability[];
};

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const fromMinutes = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`;

// The cafe writes midnight as 23:59; events then run until 24:00.
const closingMinutes = (time: string) => {
  const minutes = toMinutes(time);
  return minutes >= 23 * 60 + 59 ? 24 * 60 : minutes;
};

// Days are calendar dates (YYYY-MM-DD); weekday is taken in UTC to stay
// independent of the server's timezone.
export const weekdayOf = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay();

export const isWeekend = (date: string) => {
  const day = weekdayOf(date);
  return day === 0 || day === 6;
};

/** Hours a group event may use on the day, or null when not possible. */
export function eventWindow(
  date: string,
  dailyHours: DailyHoursLike[] = [],
): Window | null {
  if (isWeekend(date)) {
    return {
      ...WEEKEND_WINDOW,
      lastStart: fromMinutes(toMinutes(WEEKEND_WINDOW.close) - 60),
    };
  }
  const hours = dailyHours.find((h) => h.day === DAY_NAMES[weekdayOf(date)]);
  if (!hours || hours.isClosed || !hours.openingTime || !hours.closingTime) {
    return null;
  }
  const open = toMinutes(hours.openingTime);
  const close = closingMinutes(hours.closingTime);
  if (close <= open) return null;
  const lastStart = Math.min(toMinutes(WEEKDAY_LAST_START), close - 60);
  if (lastStart < open) return null;
  return {
    open: fromMinutes(open),
    close: fromMinutes(close),
    lastStart: fromMinutes(lastStart),
  };
}

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Today's date in Istanbul. */
export const istanbulToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** Applications are accepted from tomorrow up to the booking horizon. */
export function bookableRange(today: string) {
  return { from: addDays(today, 1), to: addDays(today, BOOKING_HORIZON_DAYS) };
}

const overlaps = (event: BookedEvent, start: number, end: number) =>
  toMinutes(event.startTime) < end && closingMinutes(event.endTime) > start;

/** Hour-by-hour seats left on a day (approved events) and seats requested (pending). */
export function dayAvailability(
  date: string,
  window: Window,
  events: BookedEvent[],
  capacity = GROUP_EVENT_CAPACITY,
): DayAvailability {
  const hours: HourAvailability[] = [];
  const close = toMinutes(window.close);
  for (let start = toMinutes(window.open); start < close; start += 60) {
    const end = Math.min(start + 60, close);
    let approved = 0;
    let pending = 0;
    for (const event of events) {
      if (event.date !== date || !overlaps(event, start, end)) continue;
      if (event.status === 'approved') approved += event.participantCount;
      else if (event.status === 'pending') pending += event.participantCount;
    }
    hours.push({
      hour: fromMinutes(start),
      remaining: Math.max(0, capacity - approved),
      pending,
    });
  }
  return {
    date,
    open: window.open,
    close: window.close,
    lastStart: window.lastStart,
    hours,
  };
}

/** Fewest seats left in any hour between start and end (approved events only). */
export function remainingSeats(
  date: string,
  startTime: string,
  endTime: string,
  events: BookedEvent[],
  capacity = GROUP_EVENT_CAPACITY,
  ignoreId?: number,
): number {
  const start = toMinutes(startTime);
  const end = closingMinutes(endTime);
  let least = capacity;
  for (let hour = start; hour < end; hour += 60) {
    const slotEnd = Math.min(hour + 60, end);
    const used = events
      .filter(
        (e) =>
          (ignoreId === undefined || e._id !== ignoreId) &&
          e.status === 'approved' &&
          e.date === date &&
          overlaps(e, hour, slotEnd),
      )
      .reduce((sum, e) => sum + e.participantCount, 0);
    least = Math.min(least, capacity - used);
  }
  return Math.max(0, least);
}

/** Why a requested time cannot be used, or null when it fits the day's window. */
export function timeProblem(
  window: Window | null,
  startTime: string,
  endTime: string,
): string | null {
  if (!window) return 'The cafe does not take group events on this day';
  const start = toMinutes(startTime);
  const end = closingMinutes(endTime);
  if (start % 60 !== 0 || end % 60 !== 0) {
    return 'Events start and end on the hour';
  }
  if (end <= start) return 'End time must be after start time';
  if (start < toMinutes(window.open) || end > closingMinutes(window.close)) {
    return `Events on this day must be between ${window.open} and ${window.close}`;
  }
  if (start > toMinutes(window.lastStart)) {
    return `Events on this day must start by ${window.lastStart}`;
  }
  return null;
}
