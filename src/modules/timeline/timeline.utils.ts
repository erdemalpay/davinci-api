import * as moment from 'moment-timezone';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import {
  AssignmentActionEnum,
  ButtonCallTypeEnum,
} from '../buttonCall/dto/create-buttonCall.dto';
import {
  hourToSeconds,
  toAssignmentEvents,
} from '../buttonCall/buttonCall.assignment';
import {
  TimelineItem,
  TimelineOrderAction,
  TimelineOrderLine,
} from './timeline.dto';

// The cafe closes after midnight: hours before this belong to the end of
// the cafe day, not its start.
const DAY_ROLLOVER_SECONDS = 6 * 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

// Orders sent within this many seconds of each other by the same person
// for the same table are one round.
const ORDER_ROUND_SECONDS = 90;

export const toCafeHour = (date: Date) =>
  moment(date).tz(CAFE_TIME_ZONE).format('HH:mm:ss');

// Seconds since the start of the cafe day, so 00:30 sorts after 23:30.
export function cafeDaySeconds(hour: string) {
  const seconds = hourToSeconds(hour);
  return seconds < DAY_ROLLOVER_SECONDS ? seconds + ONE_DAY_SECONDS : seconds;
}

export const byStart = (a: TimelineItem, b: TimelineItem) =>
  cafeDaySeconds(a.start) - cafeDaySeconds(b.start) ||
  cafeDaySeconds(a.end ?? a.start) - cafeDaySeconds(b.end ?? b.start);

export type TimelineCall = {
  _id: number;
  tableName: string;
  location: number;
  type: string;
  startHour: string;
  finishHour?: string;
  cancelledBy?: string;
  assignedTo?: string;
  gmCallReason?: string;
  game?: number;
  assignmentHistory?: {
    user: string;
    action: string;
    hour: string;
    reason?: string;
    note?: string;
    game?: number;
  }[];
};

const callFields = (call: TimelineCall) => ({
  callId: call._id,
  callType: call.type,
  gmCallReason: call.gmCallReason,
  game: call.game,
  callStart: call.startHour,
  callEnd: call.finishHour,
  closedBy: call.cancelledBy,
  location: call.location,
  tableName: call.tableName,
  history: toAssignmentEvents(call.assignmentHistory ?? []),
});

// A call on the table's timeline: from the button press to its close.
export function toTableCallItem(call: TimelineCall): TimelineItem {
  return {
    kind: 'call',
    start: call.startHour,
    end: call.finishHour,
    ...callFields(call),
  };
}

// The stretches of a call that were someone's: from each assignment or
// take-over until they declined, someone took it over or it was closed.
// A call they closed without it being theirs is a moment.
export function toUserCallItems(
  call: TimelineCall,
  userId: string,
): TimelineItem[] {
  const history = call.assignmentHistory ?? [];
  const items: TimelineItem[] = [];
  let heldByUser = false;
  history.forEach((entry, i) => {
    const isTake =
      entry.action === AssignmentActionEnum.ASSIGNED ||
      entry.action === AssignmentActionEnum.CLAIMED;
    if (entry.user !== userId || !isTake) return;
    const next = history.slice(i + 1).find(
      (later) =>
        // Their own decline, or anyone taking it over.
        (later.user === userId &&
          later.action === AssignmentActionEnum.DECLINED) ||
        (later.user !== userId &&
          later.action === AssignmentActionEnum.CLAIMED),
    );
    const base = {
      kind: 'call' as const,
      start: entry.hour,
      ...callFields(call),
    };
    if (next?.action === AssignmentActionEnum.DECLINED) {
      items.push({
        ...base,
        end: next.hour,
        outcome: 'declined',
        declineReason: next.reason,
        note: next.note,
      });
    } else if (next) {
      items.push({
        ...base,
        end: next.hour,
        outcome: 'takenOver',
        user: next.user,
      });
    } else {
      heldByUser = true;
      items.push({
        ...base,
        end: call.finishHour,
        outcome: call.finishHour ? 'handled' : 'open',
      });
    }
  });
  if (!heldByUser && call.cancelledBy === userId && call.finishHour) {
    items.push({
      kind: 'call',
      start: call.finishHour,
      outcome: 'closed',
      ...callFields(call),
    });
  }
  return items;
}

export const isAssignedCall = (type: string) =>
  [
    ButtonCallTypeEnum.GAMEMASTERCALL,
    ButtonCallTypeEnum.ORDERCALL,
    ButtonCallTypeEnum.ORDERREADYCALL,
  ].includes(type as ButtonCallTypeEnum);

export type TimelineOrder = {
  _id: number;
  item: number;
  quantity: number;
  status: string;
  kitchen?: string;
  table?: number;
  location: number;
  createdAt: Date;
  createdBy?: string;
  preparedAt?: Date;
  preparedBy?: string;
  deliveredAt?: Date;
  deliveredBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
};

const ORDER_STEPS: Record<
  TimelineOrderAction,
  { at: keyof TimelineOrder; by: keyof TimelineOrder }
> = {
  created: { at: 'createdAt', by: 'createdBy' },
  prepared: { at: 'preparedAt', by: 'preparedBy' },
  delivered: { at: 'deliveredAt', by: 'deliveredBy' },
  cancelled: { at: 'cancelledAt', by: 'cancelledBy' },
};

// Orders as rounds: one item per person, table and step for the orders
// done together (an order of 4 drinks is one "order placed", not four).
// `onlyBy` keeps the steps one person did.
export function toOrderItems(
  orders: TimelineOrder[],
  tableNames: Map<number, string>,
  onlyBy?: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  // When each round got its latest order.
  const lastAt = new Map<TimelineItem, number>();
  for (const action of Object.keys(ORDER_STEPS) as TimelineOrderAction[]) {
    const step = ORDER_STEPS[action];
    const done = orders
      .filter((order) => order[step.at])
      .filter((order) => !onlyBy || order[step.by] === onlyBy)
      .sort(
        (a, b) =>
          (a[step.at] as Date).getTime() - (b[step.at] as Date).getTime(),
      );
    for (const order of done) {
      const at = (order[step.at] as Date).getTime();
      const by = order[step.by] as string | undefined;
      const round = items.find(
        (item) =>
          item.orderAction === action &&
          item.user === by &&
          item.table === order.table &&
          at - (lastAt.get(item) ?? 0) <= ORDER_ROUND_SECONDS * 1000,
      );
      const line: TimelineOrderLine = {
        order: order._id,
        item: order.item,
        quantity: order.quantity,
        status: order.status,
        kitchen: order.kitchen,
      };
      if (round) {
        round.orders = [...(round.orders ?? []), line];
        lastAt.set(round, at);
        continue;
      }
      const item: TimelineItem = {
        kind: 'order',
        start: toCafeHour(order[step.at] as Date),
        orderAction: action,
        user: by,
        table: order.table,
        tableName:
          order.table !== undefined ? tableNames.get(order.table) : undefined,
        location: order.location,
        orders: [line],
      };
      items.push(item);
      lastAt.set(item, at);
    }
  }
  return items;
}
