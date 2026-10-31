import { ActivityType } from '../activity/activity.dto';
import { BreakTypeEnum } from '../break/break.dto';
import {
  cafeDaySeconds,
  findMainMiddlemen,
  findShiftEnds,
  LocationShiftHours,
  MIDDLEMAN_FROM,
  MIDDLEMAN_MIN_GAME_MASTERS,
  MIDDLEMAN_UNTIL,
  MiddlemanRecord,
  ShiftSlot,
} from '../buttonCall/buttonCall.assignment';
import {
  AssignmentActionEnum,
  ButtonCallTypeEnum,
} from '../buttonCall/dto/create-buttonCall.dto';
import { OrderCollectionStatus, OrderStatus } from '../order/order.dto';
import { TableStatus, TableTypes } from '../table/table.dto';
import { RoleEnum } from '../user/user.dto';
import { AnomalySeverity, AnomalyType } from './anomaly.dto';

// What the day's checks look at. Hours are cafe hours ("HH:mm" or
// "HH:mm:ss"); a day runs past midnight (see cafeDaySeconds).
export interface DayTable {
  _id: number;
  location: number;
  name: string;
  type?: string;
  startHour: string;
  finishHour?: string;
  status?: string;
  isOnlineSale?: boolean;
}

export interface DayOrder {
  _id: number;
  table?: number;
  location: number;
  status: string;
  quantity: number;
  paidQuantity?: number;
  unitPrice: number;
  discountAmount?: number;
  discountPercentage?: number;
  isOnlineSale?: boolean;
}

export interface DayCollection {
  _id: number;
  table?: number;
  location: number;
  amount: number;
  status: string;
  createdBy?: string;
  cancelledBy?: string;
  cancelledAt?: Date;
  createdAt?: Date;
  orders?: { order: number; paidQuantity: number }[];
}

export interface DayActivity {
  user: string;
  type: string;
  // The order, collection, table or visit the activity was about.
  payload?: {
    _id?: number;
    paidQuantity?: number;
    table?: number;
    location?: number;
    name?: string;
    user?: string;
    date?: string;
  };
  hour: string;
  at?: Date;
}

export interface DayVisit {
  user: string;
  location: number;
  startHour: string;
  finishHour?: string;
}

export interface DayShift {
  location: number;
  slots: ShiftSlot[];
  locationShifts: LocationShiftHours[];
}

export interface DayBreak {
  user: string;
  location: number;
  type?: string;
  startHour: string;
  finishHour?: string;
}

export interface DayCall {
  _id: number;
  location: number;
  tableName: string;
  type: string;
  startHour: string;
  finishHour?: string;
  assignmentHistory?: { user: string; action: string; hour: string }[];
}

export interface DayGameplay {
  _id: number;
  location: number;
  mentor?: string;
  game?: number;
  startHour?: string;
}

export interface DayUser {
  _id: string;
  role?: number;
  // Games and the day each was learned ("yyyy-MM-dd").
  games: Map<number, string | undefined>;
}

export interface DayStockChange {
  product: string;
  location: number;
  status: string;
  change: number;
  unitPrice: number;
  productName?: string;
  user?: string;
}

export interface NegativeStock {
  product: string;
  productName?: string;
  location: number;
  quantity: number;
}

export interface DayData {
  date: string;
  tables: DayTable[];
  orders: DayOrder[];
  collections: DayCollection[];
  activities: DayActivity[];
  visits: DayVisit[];
  shifts: DayShift[];
  breaks: DayBreak[];
  calls: DayCall[];
  gameplays: DayGameplay[];
  middlemen: MiddlemanRecord[];
  users: DayUser[];
  stockChanges: DayStockChange[];
  negativeStocks: NegativeStock[];
  // Each person's discounts (₺) and cancelled orders on the previous days
  // they gave any, for their usual amount.
  discountHistory: Map<string, number[]>;
  cancelHistory: Map<string, number[]>;
  // The wasted value (₺) of each of the previous days, per location.
  wasteHistory: Map<number, number[]>;
}

export interface AnomalyDraft {
  type: AnomalyType;
  severity: AnomalySeverity;
  location?: number;
  user?: string;
  // Tells the same finding apart on a rerun of the day.
  key: string;
  details: Record<string, string | number | boolean | undefined>;
}

export const EMPTY_TABLE_MINUTES = 60;
export const LONG_BREAK_MINUTES = 45;
export const LONG_BUSY_MINUTES = 60;
export const CONCURRENT_BREAK_MINUTES = 5;
// Breaks at once are fine unless this many or fewer of the people in are
// left working.
export const CONCURRENT_BREAK_MAX_WORKING = 1;
export const LATE_CHECK_OUT_MINUTES = 90;
export const LONG_WAITING_CALL_MINUTES = 10;
export const MANY_DECLINES = 5;
export const MIDDLEMAN_FLAPPING_RECORDS = 12;
export const NO_MIDDLEMAN_MINUTES = 60;
export const LARGE_STOCK_EQUALIZE_VALUE = 1000;
// A person's day against their usual day: at least this many times more,
// and at least the minimum.
export const UNUSUAL_FACTOR = 2;
export const UNUSUAL_DISCOUNT_MIN = 500;
export const UNUSUAL_CANCELS_MIN = 5;
export const UNUSUAL_WASTE_MIN = 500;

// Roles that don't check in on a shift plan.
const NOT_ON_SHIFT_PLAN = [
  RoleEnum.MANAGER,
  RoleEnum.OPERATIONSASISTANT,
  RoleEnum.COUNTER,
];
const NOT_COUNTED_ORDER = [
  OrderStatus.CANCELLED,
  OrderStatus.WASTED,
  OrderStatus.RETURNED,
] as string[];

const minutesBetween = (from: string, to: string) =>
  Math.round((cafeDaySeconds(to) - cafeDaySeconds(from)) / 60);
const money = (value: number) => Math.round(value * 100) / 100;

export const orderDiscount = (order: DayOrder) =>
  order.discountAmount > 0
    ? order.discountAmount * order.quantity
    : (order.unitPrice * order.quantity * (order.discountPercentage ?? 0)) /
      100;

const unpaidAmount = (order: DayOrder) => {
  const unpaid = order.quantity - (order.paidQuantity ?? 0);
  if (unpaid <= 0) return 0;
  const perUnitDiscount = orderDiscount(order) / order.quantity;
  return Math.max(0, unpaid * (order.unitPrice - perUnitDiscount));
};

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

// Much more than the person's (or the place's) usual day.
export function isUnusual(today: number, history: number[], min: number) {
  if (today < min) return false;
  const usual = average(history);
  return usual === 0 || today >= usual * UNUSUAL_FACTOR;
}

function checkMoney(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  const tableById = new Map(data.tables.map((t) => [t._id, t]));
  const orderById = new Map(data.orders.map((o) => [o._id, o]));

  // Orders cancelled or discounted after they were (partly) paid: taken in a
  // payment that wasn't cancelled by then. An order's own paidQuantity can't
  // tell: a 100% discount (a treat) marks it paid, any other one resets it.
  const wasPaidBefore = (order: number, at?: Date) =>
    !!at &&
    data.collections.some(
      (c) =>
        c.createdAt &&
        new Date(c.createdAt) < at &&
        (c.status !== OrderCollectionStatus.CANCELLED ||
          (!!c.cancelledAt && new Date(c.cancelledAt) > at)) &&
        c.orders?.some((o) => o.order === order && o.paidQuantity > 0),
    );
  for (const a of data.activities) {
    const type =
      a.type === ActivityType.CANCEL_ORDER
        ? AnomalyType.CANCELLED_AFTER_PAYMENT
        : a.type === ActivityType.ORDER_DISCOUNT
        ? AnomalyType.DISCOUNTED_AFTER_PAYMENT
        : undefined;
    if (!type || !wasPaidBefore(a.payload?._id, a.at)) continue;
    const order = orderById.get(a.payload._id);
    found.push({
      type,
      severity: AnomalySeverity.HIGH,
      location: order?.location ?? a.payload.location,
      user: a.user,
      key: `${a.payload._id}`,
      details: {
        order: a.payload._id,
        table: tableById.get(order?.table ?? a.payload.table)?.name,
        hour: a.hour,
      },
    });
  }

  // Payments cancelled after the table was closed.
  for (const c of data.collections) {
    if (c.status !== OrderCollectionStatus.CANCELLED || !c.cancelledAt)
      continue;
    const table = tableById.get(c.table);
    const cancelled = data.activities.find(
      (a) => a.type === ActivityType.CANCEL_PAYMENT && a.payload?._id === c._id,
    );
    if (!table?.finishHour || !cancelled) continue;
    if (cafeDaySeconds(cancelled.hour) <= cafeDaySeconds(table.finishHour)) {
      continue;
    }
    found.push({
      type: AnomalyType.PAYMENT_CANCELLED_AFTER_CLOSING,
      severity: AnomalySeverity.HIGH,
      location: c.location,
      user: c.cancelledBy ?? cancelled.user,
      key: `${c._id}`,
      details: {
        table: table.name,
        amount: money(c.amount),
        hour: cancelled.hour,
        closedAt: table.finishHour,
      },
    });
  }

  for (const c of data.collections) {
    if (c.status === OrderCollectionStatus.CANCELLED || c.amount >= 0) continue;
    found.push({
      type: AnomalyType.NEGATIVE_COLLECTION,
      severity: AnomalySeverity.MEDIUM,
      location: c.location,
      user: c.createdBy,
      key: `${c._id}`,
      details: {
        table: tableById.get(c.table)?.name,
        amount: money(c.amount),
      },
    });
  }

  // Closed tables with orders left unpaid.
  const unpaidByTable = new Map<number, number>();
  for (const o of data.orders) {
    if (NOT_COUNTED_ORDER.includes(o.status) || o.isOnlineSale) continue;
    const amount = unpaidAmount(o);
    if (amount > 0) {
      unpaidByTable.set(o.table, (unpaidByTable.get(o.table) ?? 0) + amount);
    }
  }
  for (const [tableId, amount] of unpaidByTable) {
    const table = tableById.get(tableId);
    if (!table?.finishHour || table.status === TableStatus.CANCELLED) continue;
    if (amount < 1) continue;
    found.push({
      type: AnomalyType.CLOSED_TABLE_UNPAID,
      severity: AnomalySeverity.HIGH,
      location: table.location,
      key: `${tableId}`,
      details: {
        table: table.name,
        amount: money(amount),
        closedAt: table.finishHour,
      },
    });
  }

  // Someone's discounts or cancelled orders far above their usual day.
  const discountByUser = new Map<string, number>();
  const cancelsByUser = new Map<string, number>();
  const discounted = new Set<string>();
  for (const a of data.activities) {
    if (a.type === ActivityType.ORDER_DISCOUNT) {
      const order = orderById.get(a.payload?._id);
      // Each order once, by whoever discounted it last.
      if (!order || discounted.has(`${order._id}`)) continue;
      discounted.add(`${order._id}`);
      discountByUser.set(
        a.user,
        (discountByUser.get(a.user) ?? 0) + orderDiscount(order),
      );
    }
    if (a.type === ActivityType.CANCEL_ORDER) {
      cancelsByUser.set(a.user, (cancelsByUser.get(a.user) ?? 0) + 1);
    }
  }
  for (const [user, amount] of discountByUser) {
    const history = data.discountHistory.get(user) ?? [];
    if (!isUnusual(amount, history, UNUSUAL_DISCOUNT_MIN)) continue;
    found.push({
      type: AnomalyType.UNUSUAL_DISCOUNTS,
      severity: AnomalySeverity.MEDIUM,
      user,
      key: user,
      details: { amount: money(amount), usual: money(average(history)) },
    });
  }
  for (const [user, count] of cancelsByUser) {
    const history = data.cancelHistory.get(user) ?? [];
    if (!isUnusual(count, history, UNUSUAL_CANCELS_MIN)) continue;
    found.push({
      type: AnomalyType.UNUSUAL_CANCELLATIONS,
      severity: AnomalySeverity.MEDIUM,
      user,
      key: user,
      details: { count, usual: money(average(history)) },
    });
  }
  return found;
}

function checkTables(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  const tables = data.tables.filter(
    (t) =>
      t.status !== TableStatus.CANCELLED &&
      !t.isOnlineSale &&
      t.type !== TableTypes.ONLINE &&
      t.type !== TableTypes.TAKEOUT,
  );
  const ordersByTable = new Map<number, DayOrder[]>();
  for (const o of data.orders) {
    ordersByTable.set(o.table, [...(ordersByTable.get(o.table) ?? []), o]);
  }
  for (const t of tables) {
    if (!t.finishHour) {
      found.push({
        type: AnomalyType.TABLE_LEFT_OPEN,
        severity: AnomalySeverity.MEDIUM,
        location: t.location,
        key: `${t._id}`,
        details: { table: t.name, startHour: t.startHour },
      });
      continue;
    }
    const minutes = minutesBetween(t.startHour, t.finishHour);
    const hasOrders = (ordersByTable.get(t._id) ?? []).some(
      (o) => !NOT_COUNTED_ORDER.includes(o.status),
    );
    if (!hasOrders && minutes >= EMPTY_TABLE_MINUTES) {
      found.push({
        type: AnomalyType.TABLE_WITHOUT_ORDERS,
        severity: AnomalySeverity.MEDIUM,
        location: t.location,
        key: `${t._id}`,
        details: {
          table: t.name,
          startHour: t.startHour,
          finishHour: t.finishHour,
          minutes,
        },
      });
    }
  }

  // The same table open twice at once.
  const normal = tables.filter((t) => t.type !== TableTypes.ACTIVITY);
  for (let i = 0; i < normal.length; i++) {
    for (let j = i + 1; j < normal.length; j++) {
      const [a, b] = [normal[i], normal[j]];
      if (a.location !== b.location || a.name !== b.name) continue;
      const end = (t: DayTable) =>
        t.finishHour ? cafeDaySeconds(t.finishHour) : Infinity;
      const overlaps =
        cafeDaySeconds(a.startHour) < end(b) &&
        cafeDaySeconds(b.startHour) < end(a);
      if (!overlaps) continue;
      found.push({
        type: AnomalyType.DUPLICATE_OPEN_TABLE,
        severity: AnomalySeverity.MEDIUM,
        location: a.location,
        key: `${a._id}-${b._id}`,
        details: { table: a.name, first: a.startHour, second: b.startHour },
      });
    }
  }

  for (const a of data.activities) {
    const type =
      a.type === ActivityType.REOPENED_TABLE
        ? AnomalyType.TABLE_REOPENED
        : a.type === ActivityType.DELETE_TABLE
        ? AnomalyType.TABLE_DELETED
        : undefined;
    if (!type) continue;
    found.push({
      type,
      severity:
        type === AnomalyType.TABLE_DELETED
          ? AnomalySeverity.MEDIUM
          : AnomalySeverity.LOW,
      location: a.payload?.location,
      user: a.user,
      key: `${a.payload?._id}-${a.hour}`,
      details: { table: a.payload?.name, hour: a.hour },
    });
  }
  return found;
}

function checkStaff(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  const roleOf = new Map(data.users.map((u) => [u._id, u.role]));
  const onPlan = (user: string) =>
    roleOf.has(user) && !NOT_ON_SHIFT_PLAN.includes(roleOf.get(user));

  for (const { location, slots, locationShifts } of data.shifts) {
    const planned = new Set(slots.flatMap((s) => s.user ?? []));
    const visits = data.visits.filter((v) => v.location === location);
    const came = new Set(visits.map((v) => v.user));
    for (const user of planned) {
      if (!onPlan(user) || came.has(user)) continue;
      found.push({
        type: AnomalyType.NO_SHOW,
        severity: AnomalySeverity.MEDIUM,
        location,
        user,
        key: user,
        details: {
          shift: slots.find((s) => s.user?.includes(user))?.shift,
        },
      });
    }
    for (const user of came) {
      if (!onPlan(user) || planned.has(user)) continue;
      found.push({
        type: AnomalyType.UNPLANNED_CHECK_IN,
        severity: AnomalySeverity.LOW,
        location,
        user,
        key: user,
        details: {
          startHour: visits.find((v) => v.user === user)?.startHour,
        },
      });
    }
    const ends = findShiftEnds(slots, locationShifts);
    for (const v of visits) {
      if (!onPlan(v.user)) continue;
      if (!v.finishHour) {
        found.push({
          type: AnomalyType.NOT_CHECKED_OUT,
          severity: AnomalySeverity.LOW,
          location,
          user: v.user,
          key: `${v.user}-${v.startHour}`,
          details: { startHour: v.startHour },
        });
        continue;
      }
      const end = ends.get(v.user);
      if (end === undefined) continue;
      const late = Math.round((cafeDaySeconds(v.finishHour) - end) / 60);
      if (late < LATE_CHECK_OUT_MINUTES) continue;
      found.push({
        type: AnomalyType.LATE_CHECK_OUT,
        severity: AnomalySeverity.LOW,
        location,
        user: v.user,
        key: `${v.user}-${v.startHour}`,
        details: { finishHour: v.finishHour, minutes: late },
      });
    }
  }

  for (const b of data.breaks) {
    if (!b.finishHour) continue;
    const minutes = minutesBetween(b.startHour, b.finishHour);
    const isBreak = (b.type ?? BreakTypeEnum.BREAK) === BreakTypeEnum.BREAK;
    if (minutes < (isBreak ? LONG_BREAK_MINUTES : LONG_BUSY_MINUTES)) continue;
    found.push({
      type: AnomalyType.LONG_BREAK,
      severity: AnomalySeverity.LOW,
      location: b.location,
      user: b.user,
      key: `${b.user}-${b.startHour}`,
      details: {
        breakType: b.type ?? BreakTypeEnum.BREAK,
        startHour: b.startHour,
        minutes,
      },
    });
  }
  found.push(...findConcurrentBreaks(data));

  for (const a of data.activities) {
    if (a.type !== ActivityType.DELETE_VISIT) continue;
    found.push({
      type: AnomalyType.VISIT_DELETED,
      severity: AnomalySeverity.MEDIUM,
      location: a.payload?.location,
      user: a.user,
      key: `${a.payload?._id}`,
      details: { person: a.payload?.user, hour: a.hour },
    });
  }
  return found;
}

function checkCalls(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  const declines = new Map<string, number>();
  for (const call of data.calls) {
    const history = call.assignmentHistory ?? [];
    for (const entry of history) {
      if (entry.action === AssignmentActionEnum.DECLINED && entry.user) {
        declines.set(entry.user, (declines.get(entry.user) ?? 0) + 1);
      }
    }
    if (
      call.type !== ButtonCallTypeEnum.GAMEMASTERCALL &&
      call.type !== ButtonCallTypeEnum.TABLECALL
    ) {
      continue;
    }
    const taken = history.find(
      (e) =>
        e.action === AssignmentActionEnum.ASSIGNED ||
        e.action === AssignmentActionEnum.CLAIMED,
    );
    const until = taken?.hour ?? call.finishHour;
    if (!until) continue;
    const minutes = minutesBetween(call.startHour, until);
    if (minutes < LONG_WAITING_CALL_MINUTES) continue;
    found.push({
      type: AnomalyType.LONG_WAITING_CALL,
      severity: AnomalySeverity.LOW,
      location: call.location,
      key: `${call._id}`,
      details: {
        table: call.tableName,
        callType: call.type,
        startHour: call.startHour,
        minutes,
      },
    });
  }
  for (const [user, count] of declines) {
    if (count < MANY_DECLINES) continue;
    found.push({
      type: AnomalyType.MANY_DECLINES,
      severity: AnomalySeverity.LOW,
      user,
      key: user,
      details: { count },
    });
  }

  // Games explained by someone who hadn't learned them.
  const userById = new Map(data.users.map((u) => [u._id, u]));
  for (const g of data.gameplays) {
    const mentor = g.mentor && userById.get(g.mentor);
    if (!mentor || !g.game) continue;
    if (
      mentor.role !== RoleEnum.GAMEMASTER &&
      mentor.role !== RoleEnum.GAMEMANAGER
    ) {
      continue;
    }
    const learned = mentor.games.has(g.game);
    const learnDate = mentor.games.get(g.game);
    if (learned && (!learnDate || learnDate <= data.date)) continue;
    found.push({
      type: AnomalyType.EXPLAINED_UNLEARNED_GAME,
      severity: AnomalySeverity.LOW,
      location: g.location,
      user: g.mentor,
      key: `${g._id}`,
      details: { game: g.game, startHour: g.startHour },
    });
  }

  // The middleman: none all day although game masters were enough, or
  // starting and ending again and again.
  const locations = new Set(data.shifts.map((s) => s.location));
  const gameMasters = new Set(
    data.users
      .filter(
        (u) =>
          u.role === RoleEnum.GAMEMASTER || u.role === RoleEnum.GAMEMANAGER,
      )
      .map((u) => u._id),
  );
  for (const location of locations) {
    const records = data.middlemen.filter(
      (m) => Number(m.location) === location,
    );
    if (records.length >= MIDDLEMAN_FLAPPING_RECORDS) {
      found.push({
        type: AnomalyType.MIDDLEMAN_FLAPPING,
        severity: AnomalySeverity.LOW,
        location,
        key: `${location}`,
        details: { count: records.length },
      });
    }
    const enoughMinutes = minutesWithGameMasters(
      data.visits.filter(
        (v) => v.location === location && gameMasters.has(v.user),
      ),
    );
    const hadMiddleman = findMainMiddlemen(records).length > 0;
    if (
      records.length === 0 &&
      enoughMinutes >= NO_MIDDLEMAN_MINUTES &&
      !hadMiddleman
    ) {
      found.push({
        type: AnomalyType.NO_MIDDLEMAN,
        severity: AnomalySeverity.MEDIUM,
        location,
        key: `${location}`,
        details: { minutes: enoughMinutes },
      });
    }
  }
  return found;
}

// Minutes in the middleman hours with enough game masters in the cafe.
export function minutesWithGameMasters(visits: DayVisit[]): number {
  const from = cafeDaySeconds(MIDDLEMAN_FROM);
  const until = cafeDaySeconds(MIDDLEMAN_UNTIL);
  let minutes = 0;
  for (let t = from; t < until; t += 60) {
    const inCafe = new Set(
      visits
        .filter(
          (v) =>
            cafeDaySeconds(v.startHour) <= t &&
            (!v.finishHour || cafeDaySeconds(v.finishHour) > t),
        )
        .map((v) => v.user),
    );
    if (inCafe.size >= MIDDLEMAN_MIN_GAME_MASTERS) minutes++;
  }
  return minutes;
}

function checkStock(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  for (const s of data.negativeStocks) {
    found.push({
      type: AnomalyType.NEGATIVE_STOCK,
      severity: AnomalySeverity.LOW,
      location: s.location,
      key: `${s.product}-${s.location}`,
      details: { product: s.productName ?? s.product, quantity: s.quantity },
    });
  }
  for (const c of data.stockChanges) {
    if (c.status !== 'STOCKEQUALIZE') continue;
    const value = Math.abs(c.change) * c.unitPrice;
    if (value < LARGE_STOCK_EQUALIZE_VALUE) continue;
    found.push({
      type: AnomalyType.LARGE_STOCK_EQUALIZE,
      severity: AnomalySeverity.MEDIUM,
      location: c.location,
      user: c.user,
      key: `${c.product}-${c.location}-${c.change}`,
      details: {
        product: c.productName ?? c.product,
        change: c.change,
        value: money(value),
      },
    });
  }
  const wasteByLocation = new Map<number, number>();
  for (const c of data.stockChanges) {
    if (c.status !== 'LOSSPRODUCT') continue;
    wasteByLocation.set(
      c.location,
      (wasteByLocation.get(c.location) ?? 0) + Math.abs(c.change) * c.unitPrice,
    );
  }
  for (const [location, value] of wasteByLocation) {
    const history = data.wasteHistory.get(location) ?? [];
    if (!isUnusual(value, history, UNUSUAL_WASTE_MIN)) continue;
    found.push({
      type: AnomalyType.UNUSUAL_WASTE,
      severity: AnomalySeverity.MEDIUM,
      location,
      key: `${location}`,
      details: { value: money(value), usual: money(average(history)) },
    });
  }
  return found;
}

export function findAnomalies(data: DayData): AnomalyDraft[] {
  return [
    ...checkMoney(data),
    ...checkTables(data),
    ...checkStaff(data),
    ...checkCalls(data),
    ...checkStock(data),
  ];
}

// Two or more people on a break at once while at most
// CONCURRENT_BREAK_MAX_WORKING of the people in are left working.
export function findConcurrentBreaks(data: DayData): AnomalyDraft[] {
  const found: AnomalyDraft[] = [];
  const breaks = data.breaks.filter(
    (b) =>
      b.finishHour && (b.type ?? BreakTypeEnum.BREAK) === BreakTypeEnum.BREAK,
  );
  for (const location of new Set(breaks.map((b) => b.location))) {
    const here = breaks.filter((b) => b.location === location);
    const visits = data.visits.filter((v) => v.location === location);
    // Each moment something changes, with its hour as written.
    const hours = new Map<number, string>();
    for (const x of [...here, ...visits]) {
      hours.set(cafeDaySeconds(x.startHour), x.startHour);
      if (x.finishHour) hours.set(cafeDaySeconds(x.finishHour), x.finishHour);
    }
    const points = [...hours.keys()].sort((x, y) => x - y);
    const covers = (
      x: { startHour: string; finishHour?: string },
      at: number,
    ) =>
      cafeDaySeconds(x.startHour) <= at &&
      (!x.finishHour || at < cafeDaySeconds(x.finishHour));

    let open:
      | {
          people: string;
          from: number;
          to: number;
          present: number;
          working: number;
        }
      | undefined;
    const close = () => {
      if (!open) return;
      const minutes = Math.round((open.to - open.from) / 60);
      if (minutes >= CONCURRENT_BREAK_MINUTES) {
        found.push({
          type: AnomalyType.CONCURRENT_BREAKS,
          severity: AnomalySeverity.MEDIUM,
          location,
          key: `${open.people}-${hours.get(open.from)}`,
          details: {
            people: open.people,
            from: hours.get(open.from),
            to: hours.get(open.to),
            minutes,
            present: open.present,
            working: open.working,
          },
        });
      }
      open = undefined;
    };
    for (let i = 0; i < points.length - 1; i++) {
      const at = points[i];
      const onBreak = new Set(
        here.filter((b) => covers(b, at)).map((b) => b.user),
      );
      const present = new Set([
        ...visits.filter((v) => covers(v, at)).map((v) => v.user),
        ...onBreak,
      ]);
      const working = present.size - onBreak.size;
      const people = [...onBreak].sort((x, y) => x.localeCompare(y)).join(',');
      if (onBreak.size < 2 || working > CONCURRENT_BREAK_MAX_WORKING) {
        close();
        continue;
      }
      if (open?.people !== people) {
        close();
        open = { people, from: at, to: at, present: present.size, working };
      }
      open.to = points[i + 1];
      open.present = Math.max(open.present, present.size);
      open.working = Math.min(open.working, working);
    }
    close();
  }
  return found;
}
