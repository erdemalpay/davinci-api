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

// The upstairs duty may hold several calls: service calls on top of
// service calls, and a rule question together with service calls. Never
// two game master calls, and nothing with a recommendation or an
// explanation.
export function upstairsDutyCanTake(
  openCalls: OpenCallInfo[],
  call: OpenCallInfo,
): boolean {
  if (openCalls.length === 0) return true;
  if (isLongGmCall(call) || openCalls.some(isLongGmCall)) return false;
  if (call.type === ButtonCallTypeEnum.GAMEMASTERCALL) {
    return !openCalls.some((c) => c.type === ButtonCallTypeEnum.GAMEMASTERCALL);
  }
  return true;
}

// No middleman from 22:00 on: the role ends for the night and nobody can
// take it until the next day.
export const MIDDLEMAN_UNTIL = '22:00';
export const isPastMiddlemanHours = (hour: string) =>
  cafeDaySeconds(hour) >= cafeDaySeconds(MIDDLEMAN_UNTIL);

// A game master call nobody could take for 3 minutes goes to the middleman.
export const MIDDLEMAN_AFTER_WAITING_SECONDS = 3 * 60;

// With at most 10 upstairs tables the upstairs duty helps downstairs when
// nobody else can.
export const DUTY_HELPS_DOWNSTAIRS_UP_TO = 10;
