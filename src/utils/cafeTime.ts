import * as moment from 'moment-timezone';

// The cafe's clock. The server runs in UTC, but dates and hours stored for
// the cafe (visits, tables, breaks, calls) are Istanbul time, as the panel
// sends them.
const CAFE_TIME_ZONE = 'Europe/Istanbul';

const cafeNow = () => moment.tz(CAFE_TIME_ZONE);

// "yyyy-MM-dd"
export const cafeToday = () => cafeNow().format('YYYY-MM-DD');

// "HH:mm:ss" (calls) or "HH:mm" (breaks).
export const cafeHour = (withSeconds = true) =>
  cafeNow().format(withSeconds ? 'HH:mm:ss' : 'HH:mm');

// Midnight of the cafe's day, for comparisons with stored timestamps.
export const cafeStartOfToday = () => cafeNow().startOf('day').toDate();
