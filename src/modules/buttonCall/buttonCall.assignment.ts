import { GmCallReasonEnum } from './dto/create-buttonCall.dto';

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
  }

  return best(candidates).userId;
}

// Service staff ("Servis Elemanı", stored as chefUser) of the shift slot
// that covers the given hour. A slot without an end hour runs until the next
// slot starts, or until the end of the day for the last slot.
export function findServiceStaff(
  slots: ShiftSlot[],
  hour: string,
): string | undefined {
  const now = hourToSeconds(hour);
  const sorted = [...slots]
    .filter((s) => s.shift)
    .sort((a, b) => hourToSeconds(a.shift) - hourToSeconds(b.shift));

  for (let i = 0; i < sorted.length; i++) {
    const slot = sorted[i]!;
    const start = hourToSeconds(slot.shift);
    const endHour = slot.shiftEndHour || sorted[i + 1]?.shift;
    const end = endHour ? hourToSeconds(endHour) : 24 * 3600;
    const covers =
      end < start ? now >= start || now < end : now >= start && now < end;
    if (covers) {
      return slot.chefUser || undefined;
    }
  }
  return undefined;
}
