import {
  AssignmentActionEnum,
  ButtonCallTypeEnum,
  GmCallReasonEnum,
} from './dto/create-buttonCall.dto';
import { TableTypes } from '../table/table.dto';

// Accepts both "HH:mm" (shifts) and "HH:mm:ss" (visits, calls).
export function hourToSeconds(hour: string): number {
  const [h = 0, m = 0, s = 0] = hour.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export interface AssignmentCandidate {
  userId: string;
  knownGames: Set<number>;
  // Seconds since midnight of the candidate's last action (game explanation
  // started, or call closed); the cafe check-in time when there is none yet.
  lastActivity: number;
  gameplayCountToday: number;
  // Games explained per hour lately (see recentExplanationRate).
  recentRate?: number;
  // Service staff ("Servis Elemanı") of the day, or the service role.
  isServiceStaff?: boolean;
  // Lower tiers are asked first; a higher tier only gets the call when
  // nobody in the lower ones can take it. 0 by default.
  tier?: number;
  role?: number;
}

export interface AssignmentRequest {
  reason?: GmCallReasonEnum | string;
  // The game the call is about: the requested game for an explanation, the
  // table's active game for a question.
  game?: number;
  // Who explained the table's active game (questions only).
  mentorId?: string;
}

export interface ShiftSlot {
  shift: string;
  shiftEndHour?: string;
  chefUser?: string;
  user?: string[];
  // "Operasyon Dışı": never take GM calls in this slot.
  outsideOperationUsers?: string[];
}

// Whoever has gone the longest without an action, then whoever explained
// fewer games today.
function compareCandidates(a: AssignmentCandidate, b: AssignmentCandidate) {
  return (
    a.lastActivity - b.lastActivity ||
    a.gameplayCountToday - b.gameplayCountToday ||
    a.userId.localeCompare(b.userId)
  );
}

// Someone who explained clearly fewer games lately (by this many per hour)
// goes first; otherwise the longest without an action.
export const RATE_GAP_PER_HOUR = 1;

export function best(candidates: AssignmentCandidate[]) {
  const lowestRate = Math.min(...candidates.map((c) => c.recentRate ?? 0));
  const behind = candidates.filter(
    (c) => (c.recentRate ?? 0) < lowestRate + RATE_GAP_PER_HOUR,
  );
  return [...behind].sort(compareCandidates)[0];
}

// How much of the recent past counts: long enough to even out, short
// enough that someone arriving in the evening isn't compared with the
// whole morning.
export const RATE_WINDOW_SECONDS = 3 * 3600;
// The first hour in the cafe counts as a full hour, so a newcomer with no
// explanation yet doesn't jump ahead of everyone.
const RATE_MIN_PRESENCE_SECONDS = 3600;

// Cafe days run past midnight: hours before 06:00 belong to the night.
const toCafeDaySeconds = (seconds: number) =>
  seconds < 6 * 3600 ? seconds + 24 * 3600 : seconds;
export const cafeDaySeconds = (hour: string) =>
  toCafeDaySeconds(hourToSeconds(hour));

// Games explained per hour over the last 3 hours, or since check-in when
// that is later.
export function recentExplanationRate(
  explanationStarts: string[],
  checkIn: string,
  now: string,
): number {
  const nowSeconds = cafeDaySeconds(now);
  const from = Math.max(
    nowSeconds - RATE_WINDOW_SECONDS,
    cafeDaySeconds(checkIn),
  );
  const count = explanationStarts
    .map(cafeDaySeconds)
    .filter((s) => s >= from && s <= nowSeconds).length;
  const hours = Math.max(nowSeconds - from, RATE_MIN_PRESENCE_SECONDS) / 3600;
  return count / hours;
}

export function pickAssignee(
  candidates: AssignmentCandidate[],
  request: AssignmentRequest,
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const { reason, game, mentorId } = request;

  if (reason === GmCallReasonEnum.QUESTION && mentorId) {
    const mentor = candidates.find((c) => c.userId === mentorId);
    if (mentor) {
      return mentor.userId;
    }
  }

  if (
    game !== undefined &&
    (reason === GmCallReasonEnum.QUESTION ||
      reason === GmCallReasonEnum.EXPLANATION)
  ) {
    const knowers = candidates.filter((c) => c.knownGames.has(game));
    if (knowers.length > 0) {
      return best(knowers).userId;
    }
    // An explanation or a question about a game only goes to someone who
    // knows the game; the call waits in line until one of them is free.
    return undefined;
  }

  return best(candidates).userId;
}

// Picks tier by tier with the same rules in each (e.g. a requested
// explanation only goes to someone who knows the game).
export function pickAssigneeByTier(
  candidates: AssignmentCandidate[],
  request: AssignmentRequest,
): string | undefined {
  const tiers = [...new Set(candidates.map((c) => c.tier ?? 0))].sort(
    (a, b) => a - b,
  );
  for (const tier of tiers) {
    const userId = pickAssignee(
      candidates.filter((c) => (c.tier ?? 0) === tier),
      request,
    );
    if (userId) {
      return userId;
    }
  }
  return undefined;
}

// The location's shift definitions ("10:00"–"18:00"). Shift docs often
// store only the start hour; the panel reads the end from here too.
export interface LocationShiftHours {
  shift: string;
  shiftEndHour?: string;
}

// Shift slots in start order with their time range in seconds. Slots can
// overlap (e.g. 10:00–18:00 and 14:00–22:00). The end comes from the slot,
// else from the location's shift with the same start, else the next slot's
// start, else the end of the day. An end before the start means past
// midnight.
function withBounds(slots: ShiftSlot[], locationShifts: LocationShiftHours[]) {
  const sorted = [...slots]
    .filter((s) => s.shift)
    .sort((a, b) => hourToSeconds(a.shift) - hourToSeconds(b.shift));
  return sorted.map((slot, i) => {
    const endHour =
      slot.shiftEndHour?.trim() ||
      locationShifts
        .find((ls) => ls.shift?.trim() === slot.shift.trim())
        ?.shiftEndHour?.trim() ||
      sorted.slice(i + 1).find((next) => next.shift !== slot.shift)?.shift;
    return {
      slot,
      start: hourToSeconds(slot.shift),
      end: endHour ? hourToSeconds(endHour) : 24 * 3600,
      hasEnd: !!endHour,
    };
  });
}

// When each person's shift ends (cafe-day seconds, so past midnight is
// later); the latest end when they're in several slots. People in a slot
// without a known end are left out.
export function findShiftEnds(
  slots: ShiftSlot[],
  locationShifts: LocationShiftHours[] = [],
): Map<string, number> {
  const endByUser = new Map<string, number>();
  for (const { slot, end, hasEnd } of withBounds(slots, locationShifts)) {
    if (!hasEnd) continue;
    const cafeEnd = toCafeDaySeconds(end);
    for (const userId of slot.user ?? []) {
      endByUser.set(userId, Math.max(endByUser.get(userId) ?? 0, cafeEnd));
    }
  }
  return endByUser;
}

// Close to the end of their shift a game master gets no game explanation
// (less than 10 minutes left) and no recommendation (less than 5); other
// calls still come.
const SHIFT_END_CUTOFF_SECONDS: Partial<Record<string, number>> = {
  [GmCallReasonEnum.EXPLANATION]: 10 * 60,
  [GmCallReasonEnum.RECOMMENDATION]: 5 * 60,
};

export function leavingTooSoonFor(
  gmCallReason: string | undefined,
  shiftEnd: number | undefined,
  now: string,
): boolean {
  const cutoff = gmCallReason && SHIFT_END_CUTOFF_SECONDS[gmCallReason];
  if (!cutoff || shiftEnd === undefined) return false;
  return shiftEnd - cafeDaySeconds(now) < cutoff;
}

// Service staff ("Servis Elemanı", stored as chefUser) of the day. The role
// is given for the whole day, whichever slot it's saved on.
export function findServiceStaff(slots: ShiftSlot[]): string[] {
  return slots
    .map((slot) => slot.chefUser)
    .filter((userId): userId is string => !!userId);
}

// People marked "Operasyon Dışı" on the day; also for the whole day.
export function findOutsideOperationStaff(slots: ShiftSlot[]): string[] {
  return slots.flatMap((slot) => slot.outsideOperationUsers ?? []);
}

// People scheduled in a slot that hasn't ended yet, with the hour their slot
// starts; people outside operation for the day are left out. Someone in
// several slots gets the earliest one.
export function findScheduledStaff(
  slots: ShiftSlot[],
  hour: string,
  locationShifts: LocationShiftHours[] = [],
): Map<string, string> {
  const now = hourToSeconds(hour);
  const outside = new Set(findOutsideOperationStaff(slots));
  const fromByUser = new Map<string, string>();
  for (const { slot, start, end } of withBounds(slots, locationShifts)) {
    // A slot that passes midnight is still ahead or running all day.
    const ended = end >= start && now >= end;
    if (ended) continue;
    for (const userId of slot.user ?? []) {
      if (!outside.has(userId) && !fromByUser.has(userId)) {
        fromByUser.set(userId, slot.shift);
      }
    }
  }
  return fromByUser;
}

export interface AssignmentHistoryItem {
  user: string;
  action: string;
  hour: string;
  reason?: string;
  note?: string;
  game?: number;
}

export interface AssignmentEvent extends AssignmentHistoryItem {
  // For a take-over: who had the call before.
  fromUser?: string;
}

// Walks a call's assignment history in order and adds, for every take-over,
// the person the call was taken from.
export function toAssignmentEvents(
  history: AssignmentHistoryItem[],
): AssignmentEvent[] {
  let current: string | undefined;
  return history.map((entry) => {
    const event: AssignmentEvent = { ...entry };
    if (entry.action === AssignmentActionEnum.CLAIMED && current) {
      event.fromUser = current;
    }
    current =
      entry.action === AssignmentActionEnum.DECLINED ? undefined : entry.user;
    return event;
  });
}

// Tables from 20 up and event tables are upstairs.
export const UPSTAIRS_FROM_TABLE = 20;
export const isUpstairsTableName = (tableName: string) =>
  (tableName.match(/\d+/g) ?? []).some((n) => Number(n) >= UPSTAIRS_FROM_TABLE);

// How many upstairs tables an open table takes: an event table as many as
// the tables it's set up on.
export function upstairsTableCount(table: {
  name: string;
  type?: string;
  tables?: string[];
}): number {
  if (table.type === TableTypes.ACTIVITY) {
    return Math.max(1, (table.tables ?? []).filter((t) => t?.trim()).length);
  }
  return isUpstairsTableName(table.name) ? 1 : 0;
}

// The upstairs duty passes to another free game master every 2 hours.
export const UPSTAIRS_DUTY_ROTATE_SECONDS = 2 * 3600;

// "Üstçü" (upstairs duty): someone stays upstairs once more than 6
// upstairs tables are open, and goes back to normal below 6. Only with more
// than 2 game masters taking calls in the cafe.
export const UPSTAIRS_DUTY_OPEN_ABOVE = 6;
export const UPSTAIRS_DUTY_CLOSE_BELOW = 6;
export const UPSTAIRS_DUTY_MIN_GAME_MASTERS = 3;

export function upstairsDutyChange(state: {
  upstairsTables: number;
  gameMasters: number;
  hasDuty: boolean;
}): 'start' | 'end' | undefined {
  const enoughGameMasters = state.gameMasters >= UPSTAIRS_DUTY_MIN_GAME_MASTERS;
  if (state.hasDuty) {
    return !enoughGameMasters ||
      state.upstairsTables < UPSTAIRS_DUTY_CLOSE_BELOW
      ? 'end'
      : undefined;
  }
  return enoughGameMasters && state.upstairsTables > UPSTAIRS_DUTY_OPEN_ABOVE
    ? 'start'
    : undefined;
}

export interface OpenCallInfo {
  type?: string;
  gmCallReason?: string;
}

// Recommending or explaining a game takes the person away: nothing else
// on top of it.
const isLongGmCall = (call: OpenCallInfo) =>
  call.type === ButtonCallTypeEnum.GAMEMASTERCALL &&
  call.gmCallReason !== GmCallReasonEnum.QUESTION;

// The most calls the upstairs duty holds at once.
export const UPSTAIRS_DUTY_MAX_CALLS = 5;

// The upstairs duty may hold up to 5 service calls and questions about a
// game at once, but nothing together with a recommendation or an
// explanation. Once they start explaining, their calls for other tables go
// to someone else (see releaseCallsOfExplainers).
export function upstairsDutyCanTake(
  openCalls: OpenCallInfo[],
  call: OpenCallInfo,
): boolean {
  if (openCalls.length === 0) return true;
  if (openCalls.length >= UPSTAIRS_DUTY_MAX_CALLS) return false;
  return !isLongGmCall(call) && !openCalls.some(isLongGmCall);
}

// The middleman role runs from 14:00 to 22:00: it ends for the night at
// 22:00 and nobody can take it before 14:00.
export const MIDDLEMAN_FROM = '14:00';
export const MIDDLEMAN_UNTIL = '22:00';
export const isPastMiddlemanHours = (hour: string) =>
  cafeDaySeconds(hour) >= cafeDaySeconds(MIDDLEMAN_UNTIL);
export const isMiddlemanHours = (hour: string) =>
  cafeDaySeconds(hour) >= cafeDaySeconds(MIDDLEMAN_FROM) &&
  !isPastMiddlemanHours(hour);

// Someone who ended their middleman role (or whose role a manager ended)
// isn't made the middleman or a stand-in by the system for this long, so
// they can take a break or another busy state; they can take the role
// themselves any time.
export const MIDDLEMAN_REST_SECONDS = 10 * 60;

export const isRestingAfterMiddleman = (finishHour: string, hour: string) =>
  cafeDaySeconds(hour) - cafeDaySeconds(finishHour) < MIDDLEMAN_REST_SECONDS;

// The system starts the middleman role only with at least this many game
// masters in the cafe, and ends it when fewer are left.
export const MIDDLEMAN_MIN_GAME_MASTERS = 2;

// People scheduled in a slot overlapping the middleman hours who take game
// master calls that day: not service staff, not outside operation.
export function findMiddlemanHoursStaff(
  slots: ShiftSlot[],
  locationShifts: LocationShiftHours[] = [],
): string[] {
  const from = cafeDaySeconds(MIDDLEMAN_FROM);
  const until = cafeDaySeconds(MIDDLEMAN_UNTIL);
  const excluded = new Set([
    ...findServiceStaff(slots),
    ...findOutsideOperationStaff(slots),
  ]);
  const staff = new Set<string>();
  for (const { slot, start, end } of withBounds(slots, locationShifts)) {
    const slotStart = toCafeDaySeconds(start);
    let slotEnd = toCafeDaySeconds(end);
    if (slotEnd <= slotStart) slotEnd += 24 * 3600;
    if (slotStart >= until || slotEnd <= from) continue;
    for (const userId of slot.user ?? []) {
      if (!excluded.has(userId)) staff.add(userId);
    }
  }
  return [...staff];
}

// The day's main middleman (anomaly report): whoever was the middleman (not
// a stand-in) the longest that day, at least this long. Time away on a call
// or busy while keeping the role counts too.
export const MIDDLEMAN_DAY_MIN_MINUTES = 2 * 60;

export interface MiddlemanRecord {
  user: string;
  location: number;
  date: string;
  startHour: string;
  finishHour?: string;
  coveringFor?: string;
  awayOnCall?: number;
}

// The middleman of each day and location, by the rule above.
export function findMainMiddlemen(
  records: MiddlemanRecord[],
): { date: string; location: number; user: string }[] {
  const minutesByDay = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.coveringFor || !r.finishHour) continue;
    const minutes =
      (cafeDaySeconds(r.finishHour) - cafeDaySeconds(r.startHour)) / 60;
    const key = `${r.date}|${r.location}`;
    const byUser = minutesByDay.get(key) ?? new Map<string, number>();
    byUser.set(String(r.user), (byUser.get(String(r.user)) ?? 0) + minutes);
    minutesByDay.set(key, byUser);
  }
  const main: { date: string; location: number; user: string }[] = [];
  for (const [key, byUser] of minutesByDay) {
    const [user, minutes] = [...byUser].sort((a, b) => b[1] - a[1])[0];
    if (minutes < MIDDLEMAN_DAY_MIN_MINUTES) continue;
    const [date, location] = key.split('|');
    main.push({ date, location: Number(location), user });
  }
  return main;
}

// A time range in cafe-day seconds (past midnight is later).
type Range = [number, number];

const toRange = (startHour: string, finishHour: string): Range => {
  const start = cafeDaySeconds(startHour);
  let finish = cafeDaySeconds(finishHour);
  if (finish < start) finish += 24 * 3600;
  return [start, finish];
};

// Seconds of `range` not covered by any of `cuts`.
function uncoveredSeconds(range: Range, cuts: Range[]): number {
  let total = 0;
  let from = range[0];
  for (const [start, end] of [...cuts].sort((a, b) => a[0] - b[0])) {
    if (end <= from) continue;
    if (start >= range[1]) break;
    if (start > from) total += start - from;
    from = Math.max(from, end);
    if (from >= range[1]) return total;
  }
  return total + Math.max(0, range[1] - from);
}

// Seconds covered by the union of `ranges`.
function unionSeconds(ranges: Range[]): number {
  let total = 0;
  let reached = -Infinity;
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const from = Math.max(start, reached);
    if (end > from) total += end - from;
    reached = Math.max(reached, end);
  }
  return total;
}

// Seconds each person is scheduled within the middleman hours that day
// (overlapping slots counted once); only people who take game master calls
// that day, like findMiddlemanHoursStaff.
export function findMiddlemanHoursSeconds(
  slots: ShiftSlot[],
  locationShifts: LocationShiftHours[] = [],
): Map<string, number> {
  const from = cafeDaySeconds(MIDDLEMAN_FROM);
  const until = cafeDaySeconds(MIDDLEMAN_UNTIL);
  const excluded = new Set([
    ...findServiceStaff(slots),
    ...findOutsideOperationStaff(slots),
  ]);
  const rangesByUser = new Map<string, Range[]>();
  for (const { slot, start, end } of withBounds(slots, locationShifts)) {
    const slotStart = toCafeDaySeconds(start);
    let slotEnd = toCafeDaySeconds(end);
    if (slotEnd <= slotStart) slotEnd += 24 * 3600;
    const range: Range = [Math.max(slotStart, from), Math.min(slotEnd, until)];
    if (range[1] <= range[0]) continue;
    for (const userId of slot.user ?? []) {
      if (excluded.has(userId)) continue;
      rangesByUser.set(userId, [...(rangesByUser.get(userId) ?? []), range]);
    }
  }
  return new Map(
    [...rangesByUser].map(([user, ranges]) => [user, unionSeconds(ranges)]),
  );
}

// When someone was busy elsewhere: on a call, explaining a game, or in a
// busy state (break, payment, ...).
export interface BusyRecord {
  user: string;
  date: string;
  startHour: string;
  finishHour: string;
}

// The day's middleman is picked by the shares of the last this many days
// before the day.
export const MIDDLEMAN_SHARE_DAYS = 30;

export interface MiddlemanShare {
  // Seconds they were the middleman, as the day's middleman or standing in
  // for them, without the time on a call or busy.
  seconds: number;
  // Seconds they were scheduled within the middleman hours.
  workedSeconds: number;
  // The days they were the day's main middleman (findMainMiddlemen); shown
  // only, not used for the pick.
  dates: string[];
}

// Middleman time and time worked in the middleman hours, per person.
export function countMiddlemanShares(
  records: MiddlemanRecord[],
  shifts: {
    day: string;
    slots: ShiftSlot[];
    locationShifts: LocationShiftHours[];
  }[],
  busy: BusyRecord[],
): Map<string, MiddlemanShare> {
  const shares = new Map<string, MiddlemanShare>();
  const share = (user: string) => {
    if (!shares.has(user)) {
      shares.set(user, { seconds: 0, workedSeconds: 0, dates: [] });
    }
    return shares.get(user);
  };
  for (const { slots, locationShifts } of shifts) {
    for (const [user, seconds] of findMiddlemanHoursSeconds(
      slots,
      locationShifts,
    )) {
      share(user).workedSeconds += seconds;
    }
  }
  const busyByUserDay = new Map<string, Range[]>();
  for (const b of busy) {
    if (!b.startHour || !b.finishHour) continue;
    const key = `${b.user}|${b.date}`;
    busyByUserDay.set(key, [
      ...(busyByUserDay.get(key) ?? []),
      toRange(b.startHour, b.finishHour),
    ]);
  }
  for (const r of records) {
    if (!r.startHour || !r.finishHour) continue;
    const user = String(r.user);
    share(user).seconds += uncoveredSeconds(
      toRange(r.startHour, r.finishHour),
      busyByUserDay.get(`${user}|${r.date}`) ?? [],
    );
  }
  for (const { date, user } of findMainMiddlemen(records)) {
    const dates = share(user).dates;
    if (!dates.includes(date)) dates.push(date);
  }
  for (const s of shares.values()) s.dates.sort((a, b) => a.localeCompare(b));
  return shares;
}

// Middleman time per hour worked in the middleman hours.
export const middlemanRatio = (share?: MiddlemanShare) =>
  share && share.workedSeconds > 0 ? share.seconds / share.workedSeconds : 0;

// The day's middleman: whoever was the middleman for the smallest share of
// their time worked in the middleman hours lately; then the least middleman
// time; a random one of them on a tie.
export function pickPlannedMiddleman(
  candidates: string[],
  shares: Map<string, MiddlemanShare>,
  random: () => number = Math.random,
): string | undefined {
  if (candidates.length === 0) return undefined;
  const ratio = (id: string) => middlemanRatio(shares.get(id));
  const seconds = (id: string) => shares.get(id)?.seconds ?? 0;
  const lowest = Math.min(...candidates.map(ratio));
  const byRatio = candidates.filter((id) => ratio(id) === lowest);
  const least = Math.min(...byRatio.map(seconds));
  const tied = byRatio.filter((id) => seconds(id) === least);
  return tied[Math.floor(random() * tied.length)];
}

// A call nobody could take for 2 minutes goes to the upstairs duty if they
// are free, otherwise (a game master call) to the middleman.
export const LAST_RESORT_AFTER_WAITING_SECONDS = 2 * 60;

// With at most 10 upstairs tables the upstairs duty helps downstairs right
// away when nobody else can; with more, once the call has waited.
export const DUTY_HELPS_DOWNSTAIRS_UP_TO = 10;
