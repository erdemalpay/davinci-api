import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { CAFE_TIME_ZONE, cafeHour, cafeToday } from 'src/utils/cafeTime';
import {
  findServiceStaff,
  findOutsideOperationStaff,
  isUpstairsTableName,
  toAssignmentEvents,
} from '../buttonCall/buttonCall.assignment';
import {
  AssignmentActionEnum,
  ButtonCallTypeEnum,
  isServiceCallType,
} from '../buttonCall/dto/create-buttonCall.dto';
import { BreakTypeEnum } from '../break/break.dto';
import { OrderStatus } from '../order/order.dto';
import { TableTypes } from '../table/table.dto';
import { RoleEnum } from '../user/user.dto';
import { User, UserSettings } from '../user/user.schema';
import { Break } from '../break/break.schema';
import { ButtonCall } from '../buttonCall/schemas/buttonCall.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Middleman } from '../middleman/middleman.schema';
import { Collection } from '../order/collection.schema';
import { Order } from '../order/order.schema';
import { Shift } from '../shift/shift.schema';
import { Table } from '../table/table.schema';
import { UpstairsDuty } from '../upstairsDuty/upstairsDuty.schema';
import { VisitStatus } from '../visit/visit.dto';
import { Visit } from '../visit/visit.schema';
import {
  TableTimeline,
  TimelineItem,
  UserTimeline,
  WaitingCall,
} from './timeline.dto';
import {
  computeLoad,
  LoadInput,
  Span,
  StaffBusyState,
  toSpan,
  unassignedSpans,
} from './timeline.load';
import {
  byStart,
  cafeDaySeconds,
  isAssignedCall,
  TimelineCall,
  TimelineOrder,
  toCafeHour,
  toOrderItems,
  toTableCallItem,
  toUserCallItems,
} from './timeline.utils';
import { WaitingStaff, waitingSegments } from './timeline.waiting';

const id = (ref: unknown) => ref as unknown as string;

// A cafe day for stored timestamps: from 06:00 to 06:00 the next morning,
// as the cafe closes after midnight.
const cafeDayTimestamps = (date: string) => {
  const start = moment.tz(date, CAFE_TIME_ZONE).startOf('day').add(6, 'hours');
  return { $gte: start.toDate(), $lt: start.add(1, 'day').toDate() };
};

// Read-only: what one person did through a day, and what happened at one
// table while it was open, from the records the panel already keeps.
@Injectable()
export class TimelineService {
  constructor(
    @InjectModel(Table.name) private readonly tableModel: Model<Table>,
    @InjectModel(Gameplay.name)
    private readonly gameplayModel: Model<Gameplay>,
    @InjectModel(GameplayTime.name)
    private readonly gameplayTimeModel: Model<GameplayTime>,
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Collection.name)
    private readonly collectionModel: Model<Collection>,
    @InjectModel(Visit.name) private readonly visitModel: Model<Visit>,
    @InjectModel(Break.name) private readonly breakModel: Model<Break>,
    @InjectModel(Middleman.name)
    private readonly middlemanModel: Model<Middleman>,
    @InjectModel(Shift.name) private readonly shiftModel: Model<Shift>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UpstairsDuty.name)
    private readonly upstairsDutyModel: Model<UpstairsDuty>,
  ) {}

  async findUserTimeline(user: string, date: string): Promise<UserTimeline> {
    const timestamps = cafeDayTimestamps(date);
    const [
      shifts,
      visits,
      breaks,
      middlemen,
      gameplays,
      explanations,
      calls,
      orders,
      payments,
      openedTables,
    ] = await Promise.all([
      this.shiftModel.find({ day: date }).lean(),
      this.visitModel
        .find({ user, date, status: { $ne: VisitStatus.WRONG_ENTRY } })
        .lean(),
      this.breakModel.find({ user, date }).lean(),
      this.middlemanModel.find({ user, date }).lean(),
      this.gameplayModel.find({ mentor: user, date }).lean(),
      this.gameplayTimeModel.find({ user, date }).lean(),
      this.buttonCallModel
        .find({
          date,
          $or: [{ 'assignmentHistory.user': user }, { cancelledBy: user }],
        })
        .lean(),
      this.orderModel
        .find({
          $or: [
            { createdBy: user, createdAt: timestamps },
            { preparedBy: user, preparedAt: timestamps },
            { deliveredBy: user, deliveredAt: timestamps },
            { cancelledBy: user, cancelledAt: timestamps },
          ],
        })
        .lean(),
      this.collectionModel
        .find({ createdBy: user, createdAt: timestamps })
        .lean(),
      this.tableModel.find({ createdBy: user, date }).lean(),
    ]);

    const tableIds = new Set<number>([
      ...explanations.map((e) => Number(e.table)),
      ...orders.map((o) => o.table).filter((t) => t !== undefined),
      ...payments.map((p) => p.table).filter((t) => t !== undefined),
    ]);
    const [tablesById, tableByGameplay] = await Promise.all([
      this.findTableNames([...tableIds]),
      this.findTablesOfGameplays(gameplays.map((g) => g._id as number)),
    ]);

    const items: TimelineItem[] = [
      ...shifts.flatMap((shift) =>
        (shift.shifts ?? [])
          .filter(
            (slot) =>
              slot.user?.includes(user) ||
              slot.chefUser === user ||
              slot.middlemanUser === user,
          )
          .map(
            (slot): TimelineItem => ({
              kind: 'shift',
              start: slot.shift,
              end: slot.shiftEndHour || undefined,
              location: shift.location,
              isServiceStaff: slot.chefUser === user,
              isMiddleman: slot.middlemanUser === user,
              isOutsideOperation: !!slot.outsideOperationUsers?.includes(user),
            }),
          ),
      ),
      ...visits.map(
        (visit): TimelineItem => ({
          kind: 'visit',
          start: visit.startHour,
          end: visit.finishHour,
          location: id(visit.location) as unknown as number,
        }),
      ),
      ...breaks.map(
        (record): TimelineItem => ({
          kind: 'break',
          start: record.startHour,
          end: record.finishHour,
          location: id(record.location) as unknown as number,
          breakType: record.type,
          note: record.note,
        }),
      ),
      ...middlemen.map(
        (record): TimelineItem => ({
          kind: 'middleman',
          start: record.startHour,
          end: record.finishHour,
          location: id(record.location) as unknown as number,
        }),
      ),
      ...gameplays.map((gameplay): TimelineItem => {
        const table = tableByGameplay.get(gameplay._id as number);
        return {
          kind: 'gameplay',
          start: gameplay.startHour,
          end: gameplay.finishHour,
          location: id(gameplay.location) as unknown as number,
          table: table?._id,
          tableName: table?.name ?? gameplay.activityTableName,
          game: id(gameplay.game) as unknown as number,
          playerCount: gameplay.playerCount,
          user: id(gameplay.createdBy),
        };
      }),
      ...explanations.map(
        (explanation): TimelineItem => ({
          kind: 'explanation',
          start: explanation.startHour,
          end: explanation.finishHour,
          location: id(explanation.location) as unknown as number,
          table: Number(explanation.table),
          tableName: tablesById.get(Number(explanation.table)),
        }),
      ),
      ...(calls as unknown as TimelineCall[])
        .filter((call) => isAssignedCall(call.type) || call.cancelledBy)
        .flatMap((call) => toUserCallItems(call, user)),
      ...toOrderItems(orders as unknown as TimelineOrder[], tablesById, user),
      ...payments.map(
        (payment): TimelineItem => ({
          kind: 'payment',
          start: toCafeHour(payment.createdAt),
          location: payment.location,
          table: payment.table,
          tableName:
            payment.table !== undefined
              ? tablesById.get(payment.table)
              : undefined,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          cancelled: !!payment.cancelledAt,
          cancelledBy: payment.cancelledBy,
        }),
      ),
      ...openedTables.map(
        (table): TimelineItem => ({
          kind: 'tableOpened',
          start: table.startHour,
          end: table.finishHour,
          location: table.location,
          table: table._id as unknown as number,
          tableName: table.name,
          playerCount: table.playerCount,
        }),
      ),
    ];
    return { user, date, items: items.filter((i) => i.start).sort(byStart) };
  }

  async findTableTimeline(tableId: number): Promise<TableTimeline> {
    const table = await this.tableModel.findById(tableId).lean();
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    const [gameplays, explanations, calls, orders, payments] =
      await Promise.all([
        this.gameplayModel.find({ _id: { $in: table.gameplays ?? [] } }).lean(),
        this.gameplayTimeModel.find({ table: tableId }).lean(),
        // Table names repeat through the day: only the calls while this
        // table was open.
        this.buttonCallModel
          .find({
            date: table.date,
            location: table.location,
            tableName: table.name,
          })
          .lean(),
        this.orderModel.find({ table: tableId }).lean(),
        this.collectionModel.find({ table: tableId }).lean(),
      ]);

    const opened = cafeDaySeconds(table.startHour);
    const closed = table.finishHour
      ? cafeDaySeconds(table.finishHour)
      : Number.POSITIVE_INFINITY;
    const whileOpen = (call: TimelineCall) => {
      const pressed = cafeDaySeconds(call.startHour);
      return pressed >= opened && pressed <= closed;
    };
    const tableNames = new Map([[tableId, table.name]]);

    const items: TimelineItem[] = [
      ...gameplays.map(
        (gameplay): TimelineItem => ({
          kind: 'gameplay',
          start: gameplay.startHour,
          end: gameplay.finishHour,
          game: id(gameplay.game) as unknown as number,
          playerCount: gameplay.playerCount,
          user: id(gameplay.mentor),
        }),
      ),
      ...explanations.map(
        (explanation): TimelineItem => ({
          kind: 'explanation',
          start: explanation.startHour,
          end: explanation.finishHour,
          user: id(explanation.user),
        }),
      ),
      ...(calls as unknown as TimelineCall[])
        .filter(whileOpen)
        .map(toTableCallItem),
      ...toOrderItems(orders as unknown as TimelineOrder[], tableNames),
      ...payments.map(
        (payment): TimelineItem => ({
          kind: 'payment',
          start: toCafeHour(payment.createdAt),
          user: payment.createdBy,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          cancelled: !!payment.cancelledAt,
          cancelledBy: payment.cancelledBy,
        }),
      ),
    ];
    return {
      table: {
        _id: tableId,
        name: table.name,
        date: table.date,
        location: table.location,
        startHour: table.startHour,
        finishHour: table.finishHour,
        playerCount: table.playerCount,
        type: table.type,
        createdBy: table.createdBy,
      },
      items: items.filter((i) => i.start).sort(byStart),
    };
  }

  // How busy the cafe was through the day, every 5 minutes: open calls,
  // tables and orders being prepared, and how many of the people who take
  // calls (game masters, the game manager, service staff) were free.
  async findLoad(location: number, date: string) {
    const [day, orders] = await Promise.all([
      this.loadDay(location, date),
      this.orderModel
        .find({
          location,
          createdAt: cafeDayTimestamps(date),
          status: { $ne: OrderStatus.AUTOSERVED },
        })
        .select('createdAt preparedAt deliveredAt cancelledAt')
        .lean(),
    ]);
    if (!day) return [];
    const { span, now } = day;

    const input: LoadInput = {
      calls: day.calls.map((call) => ({
        type: call.type,
        span: span(call.startHour, call.finishHour),
        unassigned: unassignedSpans(
          call.startHour,
          call.finishHour,
          call.assignmentHistory ?? [],
          now,
        ),
      })),
      tables: day.tables
        .filter(
          (t) => t.type !== TableTypes.TAKEOUT && t.type !== TableTypes.ONLINE,
        )
        .map((t) => ({
          span: span(t.startHour, t.finishHour),
          playerCount: t.playerCount ?? 0,
        })),
      orders: orders
        .map((o) => {
          const done = o.preparedAt ?? o.deliveredAt ?? o.cancelledAt;
          return {
            start: cafeDaySeconds(toCafeHour(o.createdAt)),
            end: done ? cafeDaySeconds(toCafeHour(done)) : now,
          };
        })
        .filter((o) => o.end > o.start),
      staff: [...day.takesCalls].map((user) => ({
        inCafe: day.inCafeOf(user),
        busy: day.busyOf(user),
      })),
    };
    return computeLoad(input, 5 * 60, day.from, now);
  }

  // The calls that had nobody, one by one: how long, and why stretch by
  // stretch (see waitingReasonAt). Rebuilt from the records, so with
  // today's roles and known games.
  async findWaitingCalls(
    location: number,
    date: string,
  ): Promise<WaitingCall[]> {
    const [day, duties, gameplays] = await Promise.all([
      this.loadDay(location, date),
      this.upstairsDutyModel.find({ location, date }).lean(),
      this.gameplayModel
        .find({ location, date })
        .select('mentor game startHour finishHour')
        .lean(),
    ]);
    if (!day) return [];
    const { span, now } = day;

    const isGameMasterCallRole = (role: number, settings?: UserSettings) =>
      [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER].includes(role) ||
      (role === RoleEnum.MANAGER &&
        settings?.includeInGameAssignmentsDate === date);
    // Like the assignment's candidates; baristas and the bar chef, who help
    // only when the bar is quiet, are left out as on the day load.
    const staffFor = (isServiceCall: boolean): WaitingStaff[] =>
      day.users.map((u) => {
        const user = u._id as string;
        const role = Number(u.role);
        const outside = day.outsideOperation.has(user);
        const eligible = isServiceCall
          ? !outside &&
            ([
              RoleEnum.SERVICE,
              RoleEnum.GAMEMASTER,
              RoleEnum.GAMEMANAGER,
            ].includes(role) ||
              day.serviceStaff.has(user))
          : isGameMasterCallRole(role, u.settings) &&
            !day.serviceStaff.has(user) &&
            (!outside || role === RoleEnum.GAMEMANAGER);
        return {
          user,
          inCafe: day.inCafeOf(user),
          busy: day.busyOf(user),
          eligible,
          takesCalls: day.takesCalls.has(user),
          knownGames: new Set((u.userGames ?? []).map((ug) => Number(ug.game))),
        };
      });
    const staff = { service: staffFor(true), gameMaster: staffFor(false) };
    const duty = duties.map((d) => ({
      user: id(d.user),
      span: span(d.startHour, d.finishHour),
    }));
    const gameplayById = new Map(
      gameplays.map((g) => [g._id as unknown as number, g]),
    );

    // Anything that can change why a call waits (both staff lists have the
    // same spans).
    const declinesOf = (call: TimelineCall) =>
      (call.assignmentHistory ?? [])
        .filter((h) => h.action === AssignmentActionEnum.DECLINED)
        .map((h) => ({ user: h.user, at: cafeDaySeconds(h.hour) }));
    const boundaries = [
      ...new Set(
        [
          ...staff.service.flatMap((p) => [
            ...p.inCafe,
            ...Object.values(p.busy).flat(),
          ]),
          ...duty.map((d) => d.span),
          ...gameplays.map((g) => span(g.startHour, g.finishHour)),
        ]
          .flatMap((s) => [s.start, s.end])
          .concat(day.calls.flatMap((c) => declinesOf(c).map((d) => d.at))),
      ),
    ].sort((a, b) => a - b);

    const hourOf = (seconds: number) => {
      const s = seconds % (24 * 3600);
      return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
        .map((n) => String(n).padStart(2, '0'))
        .join(':');
    };

    return day.calls
      .map((call) => {
        const start = cafeDaySeconds(call.startHour);
        // The table the call came from: the latest opened by then.
        const sameName = day.tables
          .filter((t) => t.name === call.tableName)
          .sort(
            (a, b) => cafeDaySeconds(b.startHour) - cafeDaySeconds(a.startHour),
          );
        const table =
          sameName.find((t) => cafeDaySeconds(t.startHour) <= start) ??
          sameName[0];
        const isServiceCall = isServiceCallType(call.type);
        const segments = waitingSegments(
          {
            gmCallReason: call.gmCallReason,
            game: call.game,
            unassigned: unassignedSpans(
              call.startHour,
              call.finishHour,
              call.assignmentHistory ?? [],
              now,
            ),
            isUpstairs:
              call.type !== ButtonCallTypeEnum.ORDERREADYCALL &&
              (isUpstairsTableName(call.tableName) ||
                table?.type === TableTypes.ACTIVITY),
            declines: declinesOf(call),
            tableGames: (table?.gameplays ?? []).flatMap((ref) => {
              const g = gameplayById.get(ref as unknown as number);
              return g
                ? [
                    {
                      game: Number(g.game),
                      mentor: id(g.mentor),
                      span: span(g.startHour, g.finishHour),
                    },
                  ]
                : [];
            }),
          },
          isServiceCall ? staff.service : staff.gameMaster,
          duty,
          boundaries,
        );
        return {
          callId: call._id,
          callType: call.type,
          gmCallReason: call.gmCallReason,
          game: call.game,
          tableName: call.tableName,
          table: table?._id as unknown as number | undefined,
          start: call.startHour,
          end: call.finishHour,
          assignedTo: call.assignedTo,
          closedBy: call.cancelledBy,
          waited: segments.reduce((sum, s) => sum + s.end - s.start, 0),
          segments: segments.map((s) => ({
            start: hourOf(s.start),
            end: hourOf(s.end),
            reason: s.reason,
            free: s.free,
          })),
          events: toAssignmentEvents(call.assignmentHistory ?? []),
        };
      })
      .filter((call) => call.waited > 0)
      .sort((a, b) => cafeDaySeconds(a.start) - cafeDaySeconds(b.start));
  }

  // What findLoad and findWaitingCalls read about a cafe day: its calls,
  // tables and the people who take calls, with when each was in the cafe
  // and busy. `from`–`now` is the part of the day shown. Null when nothing
  // was recorded.
  private async loadDay(location: number, date: string) {
    const isToday = date === cafeToday();
    const [calls, tables, visits, explanations, breaks, middlemen, shift] =
      await Promise.all([
        this.buttonCallModel.find({ date, location }).lean(),
        this.tableModel.find({ date, location }).lean(),
        this.visitModel
          .find({ date, location, status: { $ne: VisitStatus.WRONG_ENTRY } })
          .lean(),
        this.gameplayTimeModel.find({ date, location }).lean(),
        this.breakModel.find({ date, location }).lean(),
        this.middlemanModel.find({ date, location }).lean(),
        this.shiftModel.findOne({ day: date, location }).lean(),
      ]);

    const starts = [
      ...tables.map((t) => cafeDaySeconds(t.startHour)),
      ...visits.map((v) => cafeDaySeconds(v.startHour)),
    ];
    const ends = [
      ...tables.map((t) => t.finishHour),
      ...visits.map((v) => v.finishHour),
    ]
      .filter(Boolean)
      .map((h) => cafeDaySeconds(h as string));
    if (starts.length === 0) return null;
    const HOUR = 3600;
    const from = Math.floor(Math.min(...starts) / HOUR) * HOUR;
    const now = isToday
      ? cafeDaySeconds(cafeHour())
      : Math.ceil(Math.max(...ends, ...starts) / HOUR) * HOUR;
    const span = (start: string, end?: string) => toSpan(start, end, now);

    const slots = shift?.shifts ?? [];
    const outsideOperation = new Set(findOutsideOperationStaff(slots));
    const serviceStaff = new Set(findServiceStaff(slots));
    const visitors = [...new Set(visits.map((v) => id(v.user)))];
    const users = await this.userModel
      .find({ _id: { $in: visitors } })
      .select('role userGames settings.includeInGameAssignmentsDate')
      .lean();
    const takesCalls = new Set(
      users
        .filter(
          (u) =>
            [
              RoleEnum.GAMEMASTER,
              RoleEnum.GAMEMANAGER,
              RoleEnum.SERVICE,
            ].includes(Number(u.role)) || serviceStaff.has(u._id as string),
        )
        .map((u) => u._id as string)
        .filter((u) => !outsideOperation.has(u)),
    );

    const assignedCalls = (calls as unknown as TimelineCall[]).filter((c) =>
      isAssignedCall(c.type),
    );
    // Breaks, explanations and middleman shifts store "HH:mm"; the record's
    // own timestamps give the seconds when they fall in that minute, so a
    // record ending at 19:11:50 doesn't look over at 19:11:00.
    type Timed = {
      startHour: string;
      finishHour?: string;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const exactSpan = (r: Timed) =>
      span(
        withSeconds(r.startHour, r.createdAt),
        withSeconds(r.finishHour, r.updatedAt),
      );
    const busyOf = (user: string) => {
      const busy: Partial<Record<StaffBusyState, Span[]>> = {
        call: assignedCalls.flatMap((call) =>
          toUserCallItems(call, user)
            .filter((item) => item.outcome !== 'closed')
            .map((item) => span(item.start, item.end)),
        ),
        explaining: explanations
          .filter((e) => id(e.user) === user)
          .map((e) => exactSpan(e as unknown as Timed)),
        middleman: middlemen
          .filter((m) => id(m.user) === user)
          .map((m) => exactSpan(m as unknown as Timed)),
        break: breaks
          .filter((b) => id(b.user) === user && b.type === BreakTypeEnum.BREAK)
          .map((b) => exactSpan(b as unknown as Timed)),
        otherBusy: breaks
          .filter(
            (b) =>
              id(b.user) === user && b.type && b.type !== BreakTypeEnum.BREAK,
          )
          .map((b) => exactSpan(b as unknown as Timed)),
      };
      return busy;
    };
    const inCafeOf = (user: string) =>
      visits
        .filter((v) => id(v.user) === user)
        .map((v) => span(v.startHour, v.finishHour));

    return {
      calls: assignedCalls,
      tables,
      users,
      takesCalls,
      serviceStaff,
      outsideOperation,
      busyOf,
      inCafeOf,
      span,
      from,
      now,
    };
  }

  private async findTableNames(ids: number[]) {
    if (ids.length === 0) return new Map<number, string>();
    const tables = await this.tableModel
      .find({ _id: { $in: ids } })
      .select('name')
      .lean();
    return new Map(
      tables.map((table) => [table._id as unknown as number, table.name]),
    );
  }

  private async findTablesOfGameplays(gameplayIds: number[]) {
    const byGameplay = new Map<number, { _id: number; name: string }>();
    if (gameplayIds.length === 0) return byGameplay;
    const tables = await this.tableModel
      .find({ gameplays: { $in: gameplayIds } })
      .select('name gameplays')
      .lean();
    for (const table of tables) {
      for (const gameplay of table.gameplays ?? []) {
        byGameplay.set(gameplay as unknown as number, {
          _id: table._id as unknown as number,
          name: table.name,
        });
      }
    }
    return byGameplay;
  }
}

// "19:11" and a timestamp at 19:11:50 (cafe time) -> "19:11:50"; the hour
// as is when the timestamp is in another minute (e.g. edited later).
export function withSeconds(hour: string, at?: Date): string;
export function withSeconds(
  hour: string | undefined,
  at?: Date,
): string | undefined;
export function withSeconds(hour?: string, at?: Date) {
  if (!hour || hour.length !== 5 || !at) return hour;
  const exact = moment(at).tz(CAFE_TIME_ZONE).format('HH:mm:ss');
  return exact.startsWith(hour) ? exact : hour;
}
