import { AssignmentActionEnum } from '../buttonCall/dto/create-buttonCall.dto';
import { cafeDaySeconds } from './timeline.utils';

// Seconds since the start of the cafe day, [start, end).
export type Span = { start: number; end: number };

export type StaffBusyState =
  | 'call'
  | 'explaining'
  | 'middleman'
  | 'break'
  | 'otherBusy';

// What counts as busy, in this order when two overlap (someone explaining
// who also has a call open counts as on a call).
export const BUSY_STATES: StaffBusyState[] = [
  'call',
  'explaining',
  'middleman',
  'break',
  'otherBusy',
];

export type LoadPoint = {
  hour: string;
  gmCalls: number;
  serviceCalls: number;
  orderReadyCalls: number;
  // Open calls nobody has.
  waitingCalls: number;
  tables: number;
  customers: number;
  preparingOrders: number;
  staffInCafe: number;
  freeStaff: number;
} & Record<StaffBusyState, number>;

export type LoadInput = {
  calls: { type: string; span: Span; unassigned: Span[] }[];
  tables: { span: Span; playerCount: number }[];
  orders: Span[];
  // Per person who takes calls: when in the cafe, and when busy with what.
  staff: { inCafe: Span[]; busy: Partial<Record<StaffBusyState, Span[]>> }[];
};

const covers = (spans: Span[], t: number) =>
  spans.some((s) => s.start <= t && t < s.end);

export const toSpan = (
  start: string,
  end: string | undefined,
  now: number,
) => ({
  start: cafeDaySeconds(start),
  end: end ? cafeDaySeconds(end) : now,
});

// The stretches a call had nobody: from the button press to the first
// assignment, and from each decline to the next assignment or take-over.
export function unassignedSpans(
  start: string,
  finish: string | undefined,
  history: { action: string; hour: string }[],
  now: number,
): Span[] {
  const spans: Span[] = [];
  let freeSince: number | undefined = cafeDaySeconds(start);
  for (const entry of history) {
    const at = cafeDaySeconds(entry.hour);
    if (entry.action === AssignmentActionEnum.DECLINED) {
      freeSince ??= at;
    } else if (freeSince !== undefined) {
      spans.push({ start: freeSince, end: at });
      freeSince = undefined;
    }
  }
  if (freeSince !== undefined) {
    spans.push({
      start: freeSince,
      end: finish ? cafeDaySeconds(finish) : now,
    });
  }
  return spans;
}

// The day in steps of `step` seconds: how many calls, tables, orders and
// free staff at each moment.
export function computeLoad(
  input: LoadInput,
  step: number,
  from: number,
  to: number,
): LoadPoint[] {
  const points: LoadPoint[] = [];
  for (let t = from; t <= to; t += step) {
    const openCalls = input.calls.filter((c) => covers([c.span], t));
    const openTables = input.tables.filter((tb) => covers([tb.span], t));
    const busyCounts = Object.fromEntries(
      BUSY_STATES.map((state) => [state, 0]),
    ) as Record<StaffBusyState, number>;
    let staffInCafe = 0;
    let freeStaff = 0;
    for (const person of input.staff) {
      if (!covers(person.inCafe, t)) continue;
      staffInCafe += 1;
      const state = BUSY_STATES.find((s) => covers(person.busy[s] ?? [], t));
      if (state) busyCounts[state] += 1;
      else freeStaff += 1;
    }
    const seconds = t % (24 * 3600);
    points.push({
      hour: `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(
        Math.floor((seconds % 3600) / 60),
      ).padStart(2, '0')}`,
      gmCalls: openCalls.filter((c) => c.type === 'GAMEMASTERCALL').length,
      serviceCalls: openCalls.filter((c) => c.type === 'ORDERCALL').length,
      orderReadyCalls: openCalls.filter((c) => c.type === 'ORDERREADYCALL')
        .length,
      waitingCalls: openCalls.filter((c) => covers(c.unassigned, t)).length,
      tables: openTables.length,
      customers: openTables.reduce((sum, tb) => sum + tb.playerCount, 0),
      preparingOrders: input.orders.filter((o) => covers([o], t)).length,
      staffInCafe,
      freeStaff,
      ...busyCounts,
    });
  }
  return points;
}
