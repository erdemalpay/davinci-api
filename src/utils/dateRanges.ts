import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';

const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

export type DateRangeKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'twoMonthsAgo'
  | 'sameDayLastMonthToToday'
  | 'thisYear'
  | 'lastYear'
  | 'nextWeek'
  | 'nextMonth'
  | 'fromTodayToEndOfNextMonth';

type DateRange = {
  before: string;
  after: string;
  date: string;
  name?: string;
};

export const dateRanges: Record<DateRangeKey, () => DateRange> = {
  today: () => {
    const today = new Date();

    return {
      before: formatDate(today),
      after: formatDate(today),
      date: 'today',
    };
  },

  yesterday: () => {
    const yesterday = subDays(new Date(), 1);

    return {
      before: formatDate(yesterday),
      after: formatDate(yesterday),
      date: 'yesterday',
    };
  },

  thisWeek: () => {
    const today = new Date();

    return {
      after: formatDate(
        startOfWeek(today, {
          weekStartsOn: 1,
        }),
      ),
      before: formatDate(
        endOfWeek(today, {
          weekStartsOn: 1,
        }),
      ),
      date: 'thisWeek',
    };
  },

  lastWeek: () => {
    const previousWeek = subWeeks(new Date(), 1);

    return {
      after: formatDate(
        startOfWeek(previousWeek, {
          weekStartsOn: 1,
        }),
      ),
      before: formatDate(
        endOfWeek(previousWeek, {
          weekStartsOn: 1,
        }),
      ),
      date: 'lastWeek',
    };
  },

  thisMonth: () => {
    const today = new Date();

    return {
      after: formatDate(startOfMonth(today)),
      before: formatDate(endOfMonth(today)),
      date: 'thisMonth',
    };
  },

  lastMonth: () => {
    const previousMonth = subMonths(new Date(), 1);

    return {
      after: formatDate(startOfMonth(previousMonth)),
      before: formatDate(endOfMonth(previousMonth)),
      date: 'lastMonth',
    };
  },

  twoMonthsAgo: () => {
    const target = subMonths(new Date(), 2);

    return {
      after: formatDate(startOfMonth(target)),
      before: formatDate(endOfMonth(target)),
      date: 'twoMonthsAgo',
      name: format(target, 'MMMM'),
    };
  },

  sameDayLastMonthToToday: () => {
    const previousMonthDate = subMonths(new Date(), 1);

    return {
      after: formatDate(startOfMonth(previousMonthDate)),
      before: formatDate(previousMonthDate),
      date: 'sameDayLastMonthToToday',
    };
  },

  thisYear: () => {
    const today = new Date();

    return {
      after: formatDate(startOfYear(today)),
      before: formatDate(endOfYear(today)),
      date: 'thisYear',
    };
  },

  lastYear: () => {
    const previousYear = subYears(new Date(), 1);

    return {
      after: formatDate(startOfYear(previousYear)),
      before: formatDate(endOfYear(previousYear)),
      date: 'lastYear',
    };
  },

  nextWeek: () => {
    const nextWeekDate = addWeeks(new Date(), 1);

    return {
      after: formatDate(
        startOfWeek(nextWeekDate, {
          weekStartsOn: 1,
        }),
      ),
      before: formatDate(
        endOfWeek(nextWeekDate, {
          weekStartsOn: 1,
        }),
      ),
      date: 'nextWeek',
    };
  },

  nextMonth: () => {
    const nextMonthDate = addMonths(new Date(), 1);

    return {
      after: formatDate(startOfMonth(nextMonthDate)),
      before: formatDate(endOfMonth(nextMonthDate)),
      date: 'nextMonth',
    };
  },

  fromTodayToEndOfNextMonth: () => {
    const today = new Date();
    const nextMonthDate = addMonths(today, 1);

    return {
      after: formatDate(today),
      before: formatDate(endOfMonth(nextMonthDate)),
      date: 'fromTodayToEndOfNextMonth',
    };
  },
};
