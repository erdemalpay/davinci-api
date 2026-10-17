import { GmCallReasonEnum } from '../buttonCall/dto/create-buttonCall.dto';
import { Span, StaffBusyState } from './timeline.load';

// Why a call had nobody at a moment, checked in this order:
// - nobodyInCafe: nobody who could take this kind of call was in the cafe
// - allBusy: everyone who could take it was busy
// - otherRoleFree: only people who take other calls were free (e.g. service
//   staff while a game master call waits); the day load counts them as free
// - declined: the free ones had declined this call
// - upstairsDuty: only the upstairs duty was free, and the table is
//   downstairs
// - gameUnknown: the free ones don't know the game to explain or asked about
// - notAssigned: someone free could have taken it; the assignment hadn't
//   run yet, or the records differ from what the assignment saw
export type WaitingReason =
  | 'nobodyInCafe'
  | 'allBusy'
  | 'otherRoleFree'
  | 'declined'
  | 'upstairsDuty'
  | 'gameUnknown'
  | 'notAssigned';

export type WaitingStaff = {
  user: string;
  inCafe: Span[];
  busy: Partial<Record<StaffBusyState, Span[]>>;
  // Could get this kind of call (role, service staff, outside operation).
  eligible: boolean;
  // Takes some kind of call (the day load's staff).
  takesCalls: boolean;
  knownGames: Set<number>;
};

export type WaitingCallInput = {
  gmCallReason?: string;
  // The game to explain, or asked about (else the table's game, below).
  game?: number;
  unassigned: Span[];
  isUpstairs: boolean;
  // Declines of this call, in cafe-day seconds.
  declines: { user: string; at: number }[];
  // The table's games while it was open, for questions.
  tableGames: { game: number; mentor?: string; span: Span }[];
};

export type WaitingSegment = {
  start: number;
  end: number;
  reason: WaitingReason;
  // Who was free among the people the reason is about: the other-role
  // staff, the ones who declined, the upstairs duty, the ones who don't know
  // the game, or the ones who could have taken it.
  free: string[];
};

const covers = (spans: Span[], t: number) =>
  spans.some((s) => s.start <= t && t < s.end);

const isBusy = (person: WaitingStaff, t: number) =>
  Object.values(person.busy).some((spans) => covers(spans ?? [], t));

// The table's game at a moment: one being played, else the latest started.
function tableGameAt(call: WaitingCallInput, t: number) {
  const started = call.tableGames
    .filter((g) => g.span.start <= t)
    .sort((a, b) => b.span.start - a.span.start);
  return started.find((g) => t < g.span.end) ?? started[0];
}

export function waitingReasonAt(
  call: WaitingCallInput,
  staff: WaitingStaff[],
  duty: { user: string; span: Span }[],
  t: number,
): Omit<WaitingSegment, 'start' | 'end'> {
  const inCafe = staff.filter((p) => covers(p.inCafe, t));
  const eligible = inCafe.filter((p) => p.eligible);
  if (eligible.length === 0) return { reason: 'nobodyInCafe', free: [] };

  const free = eligible.filter((p) => !isBusy(p, t));
  if (free.length === 0) {
    const otherFree = inCafe.filter(
      (p) => !p.eligible && p.takesCalls && !isBusy(p, t),
    );
    return otherFree.length > 0
      ? { reason: 'otherRoleFree', free: otherFree.map((p) => p.user) }
      : { reason: 'allBusy', free: [] };
  }

  const declined = new Set(
    call.declines.filter((d) => d.at <= t).map((d) => d.user),
  );
  const notDeclined = free.filter((p) => !declined.has(p.user));
  if (notDeclined.length === 0) {
    return { reason: 'declined', free: free.map((p) => p.user) };
  }

  const dutyNow = duty.find((d) => covers([d.span], t))?.user;
  const available = notDeclined.filter(
    (p) => call.isUpstairs || p.user !== dutyNow,
  );
  if (available.length === 0) {
    return { reason: 'upstairsDuty', free: notDeclined.map((p) => p.user) };
  }

  const asksAboutGame =
    call.gmCallReason === GmCallReasonEnum.EXPLANATION ||
    call.gmCallReason === GmCallReasonEnum.QUESTION;
  if (asksAboutGame) {
    const tableGame =
      call.gmCallReason === GmCallReasonEnum.QUESTION
        ? tableGameAt(call, t)
        : undefined;
    const game = call.game ?? tableGame?.game;
    const mentor = game === tableGame?.game ? tableGame?.mentor : undefined;
    if (
      game !== undefined &&
      !available.some((p) => p.knownGames.has(game) || p.user === mentor)
    ) {
      return { reason: 'gameUnknown', free: available.map((p) => p.user) };
    }
  }
  return { reason: 'notAssigned', free: available.map((p) => p.user) };
}

// A call's unassigned stretches cut where anything that changes the reason
// happens (`boundaries`, sorted), with neighbours of the same reason and
// people merged.
export function waitingSegments(
  call: WaitingCallInput,
  staff: WaitingStaff[],
  duty: { user: string; span: Span }[],
  boundaries: number[],
): WaitingSegment[] {
  const segments: WaitingSegment[] = [];
  for (const span of call.unassigned) {
    const cuts = [
      span.start,
      ...boundaries.filter((b) => b > span.start && b < span.end),
      span.end,
    ];
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i];
      const end = cuts[i + 1];
      if (end <= start) continue;
      const { reason, free } = waitingReasonAt(call, staff, duty, start);
      const last = segments[segments.length - 1];
      if (
        last &&
        last.end === start &&
        last.reason === reason &&
        last.free.join() === free.join()
      ) {
        last.end = end;
      } else {
        segments.push({ start, end, reason, free });
      }
    }
  }
  return segments;
}
