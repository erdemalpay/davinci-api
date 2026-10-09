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
  // Service staff ("Servis Elemanı") of the current shift slot: only gets a
  // GM call when nobody else can take it.
  isServiceStaff?: boolean;
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
    // A requested explanation only goes to someone who knows the game; the
    // call waits in line until one of them is free.
    if (reason === GmCallReasonEnum.EXPLANATION) {
      return undefined;
    }
  }

  return best(candidates).userId;
}

// Picks among everyone but the service staff first; service staff are the
// last resort, with the same rules (e.g. they must know a requested game).
export function pickAssigneeServiceStaffLast(
  candidates: AssignmentCandidate[],
  request: AssignmentRequest,
): string | undefined {
  const regular = candidates.filter((c) => !c.isServiceStaff);
  const serviceStaff = candidates.filter((c) => c.isServiceStaff);
  return pickAssignee(regular, request) ?? pickAssignee(serviceStaff, request);
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

// Every slot running at the given hour (overlapping slots all count).
function findCurrentSlots(
  slots: ShiftSlot[],
  hour: string,
  locationShifts: LocationShiftHours[],
) {
  const now = hourToSeconds(hour);
  return withBounds(slots, locationShifts)
    .filter(({ start, end }) =>
      end < start ? now >= start || now < end : now >= start && now < end,
    )
    .map(({ slot }) => slot);
}

// Service staff ("Servis Elemanı", stored as chefUser) of the slots running
// at the given hour.
export function findServiceStaff(
  slots: ShiftSlot[],
  hour: string,
  locationShifts: LocationShiftHours[] = [],
): string[] {
  return findCurrentSlots(slots, hour, locationShifts)
    .map((slot) => slot.chefUser)
    .filter((userId): userId is string => !!userId);
}

// People marked "Operasyon Dışı" in any slot running at the given hour.
export function findOutsideOperationStaff(
  slots: ShiftSlot[],
  hour: string,
  locationShifts: LocationShiftHours[] = [],
): string[] {
  return findCurrentSlots(slots, hour, locationShifts).flatMap(
    (slot) => slot.outsideOperationUsers ?? [],
  );
}

// People scheduled in a slot that hasn't ended yet, with the hour their slot
// starts; people outside operation in that slot are left out. Someone in
// several slots gets the earliest one.
export function findScheduledStaff(
  slots: ShiftSlot[],
  hour: string,
  locationShifts: LocationShiftHours[] = [],
): Map<string, string> {
  const now = hourToSeconds(hour);
  const fromByUser = new Map<string, string>();
  for (const { slot, start, end } of withBounds(slots, locationShifts)) {
    // A slot that passes midnight is still ahead or running all day.
    const ended = end >= start && now >= end;
    if (ended) continue;
    const outside = slot.outsideOperationUsers ?? [];
    for (const userId of slot.user ?? []) {
      if (!outside.includes(userId) && !fromByUser.has(userId)) {
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
