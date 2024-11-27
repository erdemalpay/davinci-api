import {
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
  | 'sameDayLastMonthToToday'
  | 'thisYear'
  | 'lastYear';

export const dateRanges: {
  [key in DateRangeKey]: () => { before: string; after: string; date: string };
} = {
  today: () => ({
    before: formatDate(new Date()),
    after: formatDate(new Date()),
    date: 'today',
  }),
  yesterday: () => {
    const yesterday = subDays(new Date(), 1);
    return {
      before: formatDate(yesterday),
      after: formatDate(yesterday),
      date: 'yesterday',
    };
  },
  thisWeek: () => ({
    before: formatDate(new Date()),
    after: formatDate(startOfWeek(new Date(), { weekStartsOn: 1 })),
    date: 'thisWeek',
  }),
  lastWeek: () => ({
    before: formatDate(
      subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1),
    ),
    after: formatDate(
      subDays(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), 1),
    ),
    date: 'lastWeek',
  }),
  thisMonth: () => ({
    before: formatDate(new Date()),
    after: formatDate(startOfMonth(new Date())),
    date: 'thisMonth',
  }),
  lastMonth: () => ({
    before: formatDate(subDays(startOfMonth(new Date()), 1)),
    after: formatDate(startOfMonth(subMonths(new Date(), 1))),
    date: 'lastMonth',
  }),
  sameDayLastMonthToToday: () => {
    const today = new Date();
    const beforeDate = subMonths(today, 1);
    beforeDate.setDate(today.getDate());

    return {
      before: formatDate(beforeDate),
      after: formatDate(startOfMonth(beforeDate)),
      date: 'sameDayLastMonthToToday',
    };
  },
  thisYear: () => ({
    before: formatDate(new Date()),
    after: formatDate(startOfYear(new Date())),
    date: 'thisYear',
  }),
  lastYear: () => ({
    before: formatDate(subDays(startOfYear(new Date()), 1)),
    after: formatDate(startOfYear(subYears(new Date(), 1))),
    date: 'lastYear',
  }),
};
