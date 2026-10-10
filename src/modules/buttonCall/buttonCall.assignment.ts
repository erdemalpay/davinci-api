import {
  AssignmentActionEnum,
  GmCallReasonEnum,
} from './dto/create-buttonCall.dto';

// Accepts both "HH:mm" (shifts) and "HH:mm:ss" (visits, calls).
export function hourToSeconds(hour: string): number {
  const [h = 0, m = 0, s = 0] = hour.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export interface AssignmentCandidate {
  userId: string;
  knownGames: Set<number>;
  // Seconds since midnight of the candidate's last action (game explanation
  // or call assignment); the cafe check-in time when there is none yet.
  lastActivity: number;
  gameplayCountToday: number;
  // Service staff ("Servis Elemanı") of the day, or the service role.
  isServiceStaff?: boolean;
  // Lower tiers are asked first; a higher tier only gets the call when
  // nobody in the lower ones can take it. 0 by default.
  tier?: number;
}

export interface AssignmentRequest {
  reason?: GmCallReasonEnum | string;
  // The game the call is about: the requested game for an explanation, the
  // table's active game for a question.
  game?: number;
  // Who explained the table's active game (questions only).
  mentorId?: string;
  // Questions only: someone working in the cafe today knows the game (free
  // or busy). Then the question waits for them instead of going to someone
  // who doesn't know the game.
  knowerInCafe?: boolean;
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

function best(candidates: AssignmentCandidate[]) {
  return [...candidates].sort(compareCandidates)[0];
}

export function pickAssignee(
  candidates: AssignmentCandidate[],
  request: AssignmentRequest,
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const { reason, game, mentorId, knowerInCafe } = request;

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
    // A requested explanation only goes to someone who knows the game; the
    // call waits in line until one of them is free. So does a question while
    // someone in the cafe knows the game.
    if (reason === GmCallReasonEnum.EXPLANATION || knowerInCafe) {
      return undefined;
    }
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
    };
  });
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
