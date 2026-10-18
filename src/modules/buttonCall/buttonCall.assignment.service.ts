import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BUSY_STATE_STARTED_ON_DECLINE,
  BusyStateStartedEvent,
  STAFF_AVAILABILITY_CHANGED,
} from '../../lib/events';
import { BreakTypeEnum } from '../break/break.dto';
import { Break } from '../break/break.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Location } from '../location/location.schema';
import { Middleman } from '../middleman/middleman.schema';
import { OrderStatus } from '../order/order.dto';
import { Order } from '../order/order.schema';
import { Shift } from '../shift/shift.schema';
import { TableTypes } from '../table/table.dto';
import { Table } from '../table/table.schema';
import { RoleEnum } from '../user/user.dto';
import { UpstairsDuty } from '../upstairsDuty/upstairsDuty.schema';
import { User } from '../user/user.schema';
import { VisitStatus } from '../visit/visit.dto';
import { Visit } from '../visit/visit.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  AssignmentCandidate,
  AssignmentRequest,
  best,
  cafeDaySeconds,
  findOutsideOperationStaff,
  findScheduledStaff,
  findServiceStaff,
  findShiftEnds,
  hourToSeconds,
  isUpstairsTableName,
  leavingTooSoonFor,
  pickAssigneeByTier,
  recentExplanationRate,
  toAssignmentEvents,
  UPSTAIRS_DUTY_ROTATE_SECONDS,
  upstairsDutyCanTake,
  upstairsDutyChange,
  upstairsTableCount,
} from './buttonCall.assignment';
import {
  ASSIGNED_CALL_TYPES,
  AssignmentActionEnum,
  ButtonCallActionEnum,
  ButtonCallTypeEnum,
  CallReportQueryDto,
  ChangeGmCallRequestDto,
  DeclineButtonCallDto,
  DeclineReasonEnum,
  GameAvailabilityStatus,
  GmCallReasonEnum,
  isServiceCallType,
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { cafeHour, cafeStartOfToday, cafeToday } from 'src/utils/cafeTime';

// Who can get which call, in tiers (lower tiers are asked first).
//
// Game master calls: game masters, then the game manager, then managers
// who opted in for the day and a game manager marked outside operation. A
// game master marked service staff for the day gets none.
//
// The middleman gets no call, except an explanation or a question about a
// game nobody else in the cafe knows while another game master is free:
// then they go, and the free game master stands in as middleman until
// they're back.
//
// The upstairs duty ("Üstçü") gets the upstairs tables' game master and
// service calls first, and no other call.
//
// Service calls (a table calling to order, or the bar calling for ready
// orders to be taken): service staff (service role or the GM marked service staff
// for the day), then game masters, then the game manager, then baristas,
// then the bar chef running the bar. Never the middleman.
//
// A barista helps only when no order is being prepared, nobody is at a
// table for a service call (they'll likely bring an order) and the table is
// downstairs. The bar chef runs the bar only on days they are marked
// outside operation; any other day they work as a barista.
//
// Nobody else marked outside operation for the day gets any call.
const SERVICE_CALL_ROLES = [
  RoleEnum.SERVICE,
  RoleEnum.GAMEMASTER,
  RoleEnum.GAMEMANAGER,
  RoleEnum.BARISTA,
  RoleEnum.BARCHEF,
];

// Game masters and game managers; managers only on a day they opted in.
function gameMasterCallRoleFilter(date: string) {
  return {
    $or: [
      { role: { $in: [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER] } },
      {
        role: RoleEnum.MANAGER,
        'settings.includeInGameAssignmentsDate': date,
      },
    ],
  };
}

// The exceptions to "outside operation gets no call": a game manager may
// still take game master calls, and the bar chef (running the bar) service
// calls, as the very last resort.
const takesCallsOutsideOperation = (role: number, isServiceCall: boolean) =>
  isServiceCall ? role === RoleEnum.BARCHEF : role === RoleEnum.GAMEMANAGER;

// Before everyone else for the upstairs tables.
const UPSTAIRS_DUTY_TIER = -1;

// The middleman goes back once their call is closed and they aren't
// explaining a game; the delay leaves time for the explanation to start.
const HAND_BACK_AFTER_SECONDS = 60;

function gmCallTier(role: number, isLastResort: boolean) {
  if (role === RoleEnum.MANAGER || isLastResort) return 2;
  if (role === RoleEnum.GAMEMANAGER) return 1;
  return 0;
}

function serviceCallTier(
  role: number,
  isServiceStaff: boolean,
  actsAsBarista: boolean,
) {
  if (isServiceStaff || role === RoleEnum.SERVICE) return 0;
  if (actsAsBarista) return 3;
  switch (role) {
    case RoleEnum.GAMEMASTER:
      return 1;
    case RoleEnum.GAMEMANAGER:
      return 2;
    default:
      return 4;
  }
}

const isAssignedCallType = (type?: string) =>
  ASSIGNED_CALL_TYPES.includes(type as ButtonCallTypeEnum);

// A decline because of something else to do puts the person in that busy
// state (a break-like record) so they get no other call meanwhile.
const BUSY_STATE_FOR_DECLINE: Partial<
  Record<DeclineReasonEnum, BreakTypeEnum>
> = {
  [DeclineReasonEnum.BREAK]: BreakTypeEnum.BREAK,
  [DeclineReasonEnum.TAKING_PAYMENT]: BreakTypeEnum.TAKING_PAYMENT,
  [DeclineReasonEnum.WC]: BreakTypeEnum.WC,
  [DeclineReasonEnum.WAREHOUSE]: BreakTypeEnum.WAREHOUSE,
  [DeclineReasonEnum.BAR_CLEANING]: BreakTypeEnum.BAR_CLEANING,
  [DeclineReasonEnum.RECOMMENDING_GAME]: BreakTypeEnum.RECOMMENDING_GAME,
  [DeclineReasonEnum.PREPARING_ORDER]: BreakTypeEnum.PREPARING_ORDER,
  [DeclineReasonEnum.OTHER]: BreakTypeEnum.OTHER,
};

type CallInfo = Pick<
  ButtonCall,
  'tableName' | 'location' | 'date' | 'gmCallReason' | 'game' | 'declinedBy'
>;

type MiddlemanRecord = {
  _id: number;
  user: unknown;
  location: unknown;
  date: string;
};

const today = cafeToday;
const nowHour = () => cafeHour();

// Assigns game master calls to the most suitable available game master.
@Injectable()
export class ButtonCallAssignmentService {
  private readonly logger = new Logger(ButtonCallAssignmentService.name);
  // Assignments run one at a time so that two calls created, declined or
  // retried at the same moment can't both pick the same free person.
  private assignmentQueue: Promise<unknown> = Promise.resolve();
  private isPendingRunScheduled = false;

  constructor(
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
    @InjectModel(Visit.name) private readonly visitModel: Model<Visit>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Break.name) private readonly breakModel: Model<Break>,
    @InjectModel(Middleman.name)
    private readonly middlemanModel: Model<Middleman>,
    @InjectModel(GameplayTime.name)
    private readonly gameplayTimeModel: Model<GameplayTime>,
    @InjectModel(Gameplay.name)
    private readonly gameplayModel: Model<Gameplay>,
    @InjectModel(Shift.name) private readonly shiftModel: Model<Shift>,
    @InjectModel(Table.name) private readonly tableModel: Model<Table>,
    private readonly websocketGateway: AppWebSocketGateway,
    @InjectModel(Location.name)
    private readonly locationModel: Model<Location>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(UpstairsDuty.name)
    private readonly upstairsDutyModel: Model<UpstairsDuty>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Tries to assign an open, unassigned game master call. Leaves the call
  // unassigned when nobody is available; it is retried when someone becomes
  // available, and by the cron as a fallback.
  assign(callId: number): Promise<ButtonCall | null> {
    const run = this.assignmentQueue.then(() => this.assignNow(callId));
    this.assignmentQueue = run.catch(() => undefined);
    return run;
  }

  private async assignNow(callId: number): Promise<ButtonCall | null> {
    const call = await this.buttonCallModel.findById(callId).lean();
    if (
      !call ||
      !isAssignedCallType(call.type) ||
      call.finishHour ||
      call.assignedTo
    ) {
      return null;
    }

    const hour = nowHour();
    const candidates = await this.findCandidates(
      call.location,
      call.date,
      hour,
      call.declinedBy ?? [],
      call.type as ButtonCallTypeEnum,
      call.tableName,
      call.gmCallReason,
    );
    const request = isServiceCallType(call.type)
      ? {}
      : await this.buildRequest(call);
    let userId = pickAssigneeByTier(candidates, request);
    let standIn: { middleman: MiddlemanRecord; user: string } | undefined;
    if (!userId) {
      standIn = await this.findMiddlemanStandIn(call, request, candidates);
      userId = standIn && String(standIn.middleman.user);
    }
    if (!userId) {
      return null;
    }

    const assigned = await this.buttonCallModel.findOneAndUpdate(
      {
        _id: callId,
        finishHour: { $exists: false },
        assignedTo: { $exists: false },
      },
      {
        $set: { assignedTo: userId, assignedHour: hour },
        $unset: { explainerUnavailable: '' },
        $push: {
          assignmentHistory: {
            user: userId,
            action: AssignmentActionEnum.ASSIGNED,
            hour,
          },
        },
      },
      { new: true },
    );
    if (assigned) {
      if (standIn) {
        await this.startStandIn(standIn.middleman, standIn.user, assigned);
      }
      this.websocketGateway.emitButtonCallChanged(
        assigned,
        ButtonCallActionEnum.ASSIGN,
      );
    }
    return assigned;
  }

  // An explanation or a question about a game only the middleman knows:
  // the middleman goes when a free game master can stand in for them.
  // Someone else in the cafe who knows the game, even busy, is waited for.
  private async findMiddlemanStandIn(
    call: CallInfo,
    request: AssignmentRequest,
    candidates: AssignmentCandidate[],
  ) {
    const { game, reason } = request;
    if (
      game === undefined ||
      (reason !== GmCallReasonEnum.EXPLANATION &&
        reason !== GmCallReasonEnum.QUESTION)
    ) {
      return undefined;
    }
    const middleman = await this.middlemanModel
      .findOne({
        location: call.location,
        date: call.date,
        finishHour: { $exists: false },
        // A stand-in doesn't hand over again.
        coveringFor: { $exists: false },
      })
      .lean();
    const middlemanId = middleman && String(middleman.user);
    if (!middleman || (call.declinedBy ?? []).includes(middlemanId)) {
      return undefined;
    }
    const standIns = candidates.filter(
      (c) => c.role === RoleEnum.GAMEMASTER || c.role === RoleEnum.GAMEMANAGER,
    );
    if (standIns.length === 0) {
      return undefined;
    }
    const [knows, othersKnow] = await Promise.all([
      this.userModel.exists({ _id: middlemanId, 'userGames.game': game }),
      this.someoneElseKnows(call, game, middlemanId),
    ]);
    if (!knows || othersKnow) {
      return undefined;
    }
    return { middleman, user: best(standIns).userId };
  }

  // Anyone else in the cafe who takes game master calls and knows the game,
  // busy or not.
  private async someoneElseKnows(
    call: CallInfo,
    game: number,
    middlemanId: string,
  ) {
    const [checkInByUser, { slots }] = await Promise.all([
      this.findCheckInByUser(call.location, call.date),
      this.findShiftSlots(call.location, call.date),
    ]);
    const serviceStaff = new Set(findServiceStaff(slots));
    const outsideOperation = new Set(findOutsideOperationStaff(slots));
    const knowers = await this.userModel
      .find({
        _id: {
          $in: [...checkInByUser.keys()].filter(
            (id) =>
              id !== middlemanId &&
              !serviceStaff.has(id) &&
              !(call.declinedBy ?? []).includes(id),
          ),
        },
        active: true,
        ...gameMasterCallRoleFilter(call.date),
        'userGames.game': game,
      })
      .select('_id role')
      .lean();
    return knowers.some(
      (user) =>
        !outsideOperation.has(user._id as string) ||
        takesCallsOutsideOperation(Number(user.role), false),
    );
  }

  // The middleman leaves for the call; the stand-in becomes middleman.
  private async startStandIn(
    middleman: MiddlemanRecord,
    standInId: string,
    call: Pick<ButtonCall, '_id' | 'game'>,
  ) {
    const hour = cafeHour(false);
    await this.middlemanModel.updateOne(
      { _id: middleman._id, finishHour: { $exists: false } },
      { $set: { finishHour: hour } },
    );
    await this.middlemanModel.create({
      user: standInId,
      location: middleman.location,
      date: middleman.date,
      startHour: hour,
      coveringFor: String(middleman.user),
      coveringCall: call._id,
      coveringGame: call.game,
    });
    this.websocketGateway.emitMiddlemanChanged();
  }

  // The middleman is back when their call is over and they aren't
  // explaining a game: they take the role back and the stand-in is free.
  // A middleman who left the cafe leaves the role to the stand-in.
  private async handBackMiddlemen(date: string) {
    const standIns = await this.middlemanModel
      .find({
        date,
        finishHour: { $exists: false },
        coveringFor: { $exists: true },
      })
      .lean();
    for (const standIn of standIns) {
      const middlemanId = String(standIn.coveringFor);
      const [call, explaining, inCafe] = await Promise.all([
        this.buttonCallModel
          .findById(standIn.coveringCall)
          .select('assignedTo finishHour')
          .lean(),
        this.gameplayTimeModel.exists({
          user: middlemanId,
          date,
          finishHour: { $exists: false },
        }),
        this.visitModel.exists({
          user: middlemanId,
          date,
          location: standIn.location,
          finishHour: { $exists: false },
        }),
      ]);
      if (!inCafe) {
        await this.middlemanModel.updateOne(
          { _id: standIn._id },
          { $unset: { coveringFor: '', coveringCall: '', coveringGame: '' } },
        );
        this.websocketGateway.emitMiddlemanChanged();
        continue;
      }
      const onCall =
        call && !call.finishHour && call.assignedTo === middlemanId;
      const justClosed =
        call?.finishHour &&
        hourToSeconds(nowHour()) - hourToSeconds(call.finishHour) <
          HAND_BACK_AFTER_SECONDS;
      if (onCall || explaining || justClosed) {
        continue;
      }
      const hour = cafeHour(false);
      const ended = await this.middlemanModel.updateOne(
        { _id: standIn._id, finishHour: { $exists: false } },
        { $set: { finishHour: hour } },
      );
      if (ended.modifiedCount === 0) continue;
      await this.middlemanModel.create({
        user: middlemanId,
        location: standIn.location,
        date,
        startHour: hour,
      });
      this.websocketGateway.emitMiddlemanChanged();
    }
  }

  // Starts or ends the upstairs duty of each location with people in the
  // cafe, by the number of open upstairs tables and game masters.
  private async updateUpstairsDuties(date: string) {
    const locations: number[] = await this.visitModel.distinct('location', {
      date,
      finishHour: { $exists: false },
    });
    for (const location of locations) {
      await this.updateUpstairsDuty(Number(location), date);
    }
  }

  private async updateUpstairsDuty(location: number, date: string) {
    const [duty, tables, checkInByUser, { slots }, middlemen] =
      await Promise.all([
        this.upstairsDutyModel
          .findOne({ location, date, finishHour: { $exists: false } })
          .lean(),
        this.tableModel
          .find({
            location,
            date,
            finishHour: { $exists: false },
            type: { $nin: [TableTypes.TAKEOUT, TableTypes.ONLINE] },
          })
          .select('name type tables')
          .lean(),
        this.findCheckInByUser(location, date),
        this.findShiftSlots(location, date),
        this.findMiddlemanIds(date),
      ]);
    const upstairsTables = tables.reduce(
      (n, t) => n + upstairsTableCount(t),
      0,
    );
    const serviceStaff = new Set(findServiceStaff(slots));
    const outsideOperation = new Set(findOutsideOperationStaff(slots));
    const gameMasters = await this.userModel
      .find({
        _id: {
          $in: [...checkInByUser.keys()].filter(
            (id) =>
              !serviceStaff.has(id) &&
              !outsideOperation.has(id) &&
              !middlemen.includes(id),
          ),
        },
        active: true,
        role: { $in: [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER] },
      })
      .select('_id')
      .lean();
    const gameMasterIds = gameMasters.map((u) => u._id as string);
    const dutyGone = !!duty && !gameMasterIds.includes(String(duty.user));
    const change = upstairsDutyChange({
      upstairsTables,
      gameMasters: gameMasterIds.length,
      hasDuty: !!duty && !dutyGone,
    });

    if (duty && (dutyGone || change === 'end')) {
      await this.upstairsDutyModel.updateOne(
        { _id: duty._id, finishHour: { $exists: false } },
        { $set: { finishHour: cafeHour(false) } },
      );
      this.websocketGateway.emitUpstairsDutyChanged();
      this.handleStaffAvailabilityChanged();
      return;
    }
    const rotate =
      !!duty &&
      cafeDaySeconds(nowHour()) - cafeDaySeconds(duty.startHour) >=
        UPSTAIRS_DUTY_ROTATE_SECONDS;
    if (change !== 'start' && !rotate) return;
    // The free game master who has waited longest; on a rotation someone
    // else than the one on duty, who stays on duty while nobody is free.
    const free = (
      await this.findCandidates(location, date, nowHour(), [])
    ).filter(
      (c) =>
        gameMasterIds.includes(c.userId) &&
        (!duty || c.userId !== String(duty.user)),
    );
    if (free.length === 0) return;
    if (duty) {
      const ended = await this.upstairsDutyModel.updateOne(
        { _id: duty._id, finishHour: { $exists: false } },
        { $set: { finishHour: cafeHour(false) } },
      );
      if (ended.modifiedCount === 0) return;
    }
    await this.upstairsDutyModel.create({
      user: best(free).userId,
      location,
      date,
      startHour: cafeHour(false),
    });
    this.websocketGateway.emitUpstairsDutyChanged();
  }

  // Someone takes the upstairs duty over from whoever has it now. Only a
  // game master (or the game manager) in the cafe who isn't the middleman.
  async takeUpstairsDuty(user: User, location: number) {
    const userId = String(user._id);
    const role = Number(
      (user.role as unknown as { _id?: number })?._id ?? user.role,
    );
    if (role !== RoleEnum.GAMEMASTER && role !== RoleEnum.GAMEMANAGER) {
      throw new BadRequestException('Only game masters take upstairs duty');
    }
    const date = cafeToday();
    const [duty, inCafe, middlemen] = await Promise.all([
      this.upstairsDutyModel
        .findOne({ location, date, finishHour: { $exists: false } })
        .lean(),
      this.visitModel.exists({
        user: userId,
        location,
        date,
        finishHour: { $exists: false },
      }),
      this.findMiddlemanIds(date),
    ]);
    if (!duty) {
      throw new BadRequestException('There is no upstairs duty right now');
    }
    if (String(duty.user) === userId) return duty;
    if (!inCafe) {
      throw new BadRequestException('Check in to the cafe first');
    }
    if (middlemen.includes(userId)) {
      throw new BadRequestException('The middleman cannot take upstairs duty');
    }
    const hour = cafeHour(false);
    const ended = await this.upstairsDutyModel.updateOne(
      { _id: duty._id, finishHour: { $exists: false } },
      { $set: { finishHour: hour } },
    );
    if (ended.modifiedCount === 0) {
      throw new BadRequestException('The upstairs duty just changed');
    }
    const taken = await this.upstairsDutyModel.create({
      user: userId,
      location,
      date,
      startHour: hour,
    });
    this.websocketGateway.emitUpstairsDutyChanged();
    this.handleStaffAvailabilityChanged();
    return taken;
  }

  async decline(
    user: User,
    callId: number,
    dto: DeclineButtonCallDto,
  ): Promise<ButtonCall> {
    const call = await this.findOpenCall(callId);
    if (call.assignedTo !== user._id) {
      throw new BadRequestException('This call is not assigned to you');
    }
    // "Which game does the table need help with?": the game the game master
    // names (the call's game shown first, but they may correct it), else the
    // call's game.
    const unknownGame =
      dto.reason === DeclineReasonEnum.DOESNT_KNOW_GAME
        ? dto.game ?? call.game
        : undefined;
    if (dto.reason === DeclineReasonEnum.DOESNT_KNOW_GAME && !unknownGame) {
      throw new BadRequestException(
        'Select the game the table needs help with',
      );
    }
    const declined = await this.buttonCallModel.findOneAndUpdate(
      { _id: callId, assignedTo: user._id, finishHour: { $exists: false } },
      {
        $unset: { assignedTo: '', assignedHour: '' },
        // Busy with something else (taking a payment, ...): they're out of
        // assignment while busy, and the call may come back to them when
        // they're done if nobody took it meanwhile. Otherwise (they don't
        // know the game) it never comes back to them.
        ...(!BUSY_STATE_FOR_DECLINE[dto.reason] && {
          $addToSet: { declinedBy: user._id },
        }),
        // The call now names the (corrected) game, so it goes to someone
        // who knows it.
        ...(unknownGame &&
          unknownGame !== call.game && { $set: { game: unknownGame } }),
        $push: {
          assignmentHistory: {
            user: user._id,
            action: AssignmentActionEnum.DECLINED,
            hour: nowHour(),
            reason: dto.reason,
            ...(dto.reason === DeclineReasonEnum.OTHER && {
              note: dto.note?.trim(),
            }),
            ...(unknownGame && { game: unknownGame }),
          },
        },
      },
      { new: true },
    );
    if (!declined) {
      throw new NotFoundException('Call not found');
    }
    await this.enterBusyState(user, declined, dto);
    const reassigned = await this.assign(callId);
    if (reassigned) {
      return reassigned;
    }
    const result = (await this.flagIfNoExplainerLeft(declined)) ?? declined;
    this.websocketGateway.emitButtonCallChanged(
      result,
      ButtonCallActionEnum.ASSIGN,
    );
    return result;
  }

  // "I'm taking a payment" etc.: the person is busy with that until they end
  // it, like a break. Nothing happens if they're already busy or on a break.
  private async enterBusyState(
    user: User,
    call: ButtonCall,
    dto: DeclineButtonCallDto,
  ) {
    const type = BUSY_STATE_FOR_DECLINE[dto.reason];
    if (!type) {
      return;
    }
    const date = today();
    const alreadyBusy = await this.breakModel.exists({
      user: user._id,
      date,
      finishHour: { $exists: false },
    });
    if (alreadyBusy) {
      return;
    }
    const breakRecord = {
      user: user._id,
      location: call.location,
      date,
      startHour: cafeHour(false),
      type,
      ...(type === BreakTypeEnum.OTHER && { note: dto.note?.trim() }),
    };
    await this.breakModel.create(breakRecord);
    this.websocketGateway.emitBreakChanged();
    // Activity log and the concurrent break warning, as for any break.
    const event: BusyStateStartedEvent = { breakRecord };
    this.eventEmitter.emit(BUSY_STATE_STARTED_ON_DECLINE, event);
  }

  // An explanation call stays in line for someone who knows the game. When
  // everyone who knows it (in the cafe or arriving later today) has declined,
  // flag the call so the table can pick another game.
  private async flagIfNoExplainerLeft(call: ButtonCall) {
    const needsKnower =
      call.gmCallReason === GmCallReasonEnum.EXPLANATION ||
      call.gmCallReason === GmCallReasonEnum.QUESTION;
    if (!needsKnower || !call.game) {
      return null;
    }
    const { status } = await this.getGameAvailability(
      call.location,
      call.game,
      call.declinedBy ?? [],
    );
    if (status !== GameAvailabilityStatus.UNAVAILABLE) {
      return null;
    }
    return this.buttonCallModel.findOneAndUpdate(
      { _id: call._id, finishHour: { $exists: false } },
      { $set: { explainerUnavailable: true } },
      { new: true },
    );
  }

  // The table picked another game or asked for something else instead of
  // the game nobody can explain. Keeps its place in the queue.
  async changeRequest(
    callId: number,
    dto: ChangeGmCallRequestDto,
  ): Promise<ButtonCall> {
    const changed = await this.buttonCallModel.findOneAndUpdate(
      {
        _id: callId,
        location: dto.location,
        tableName: dto.tableName,
        type: ButtonCallTypeEnum.GAMEMASTERCALL,
        finishHour: { $exists: false },
      },
      {
        $set: {
          gmCallReason: dto.gmCallReason,
          // People who declined the previous game may know the new one.
          declinedBy: [],
          ...(dto.game !== undefined && { game: dto.game }),
        },
        $unset: {
          explainerUnavailable: '',
          ...(dto.game === undefined && { game: '' }),
        },
      },
      { new: true },
    );
    if (!changed) {
      throw new NotFoundException('Call not found');
    }
    this.websocketGateway.emitButtonCallChanged(
      changed,
      ButtonCallActionEnum.ASSIGN,
    );
    return (await this.assign(callId)) ?? changed;
  }

  async claim(user: User, callId: number): Promise<ButtonCall> {
    const call = await this.findOpenCall(callId);
    const otherOpenCall = await this.buttonCallModel.exists({
      _id: { $ne: callId },
      date: call.date,
      type: { $in: ASSIGNED_CALL_TYPES },
      assignedTo: user._id,
      finishHour: { $exists: false },
    });
    if (otherOpenCall) {
      throw new BadRequestException(
        'You already have an assigned call. Close it before taking another one.',
      );
    }
    const hour = nowHour();
    const claimed = await this.buttonCallModel.findOneAndUpdate(
      { _id: callId, finishHour: { $exists: false } },
      {
        $set: { assignedTo: user._id, assignedHour: hour },
        $unset: { explainerUnavailable: '' },
        $pull: { declinedBy: user._id },
        $push: {
          assignmentHistory: {
            user: user._id,
            action: AssignmentActionEnum.CLAIMED,
            hour,
          },
        },
      },
      { new: true },
    );
    if (!claimed) {
      throw new NotFoundException('Call not found');
    }
    this.websocketGateway.emitButtonCallChanged(
      claimed,
      ButtonCallActionEnum.ASSIGN,
    );
    return claimed;
  }

  // A break, explanation or middleman shift ended, or someone checked in:
  // assign calls that were waiting for a free game master right away.
  // Bursts of events collapse into a single run.
  @OnEvent(STAFF_AVAILABILITY_CHANGED)
  handleStaffAvailabilityChanged() {
    if (this.isPendingRunScheduled) {
      return;
    }
    this.isPendingRunScheduled = true;
    setImmediate(() => {
      this.isPendingRunScheduled = false;
      this.assignPendingCalls().catch((error) =>
        this.logger.error('Failed to assign pending button calls', error),
      );
    });
  }

  // Fallback for anything the availability event misses.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async assignPendingCalls() {
    try {
      await this.handBackMiddlemen(today());
      await this.updateUpstairsDuties(today());
    } catch (error) {
      this.logger.error('Failed to update middleman / upstairs duty', error);
    }
    const pending = await this.buttonCallModel
      .find({
        date: today(),
        type: { $in: ASSIGNED_CALL_TYPES },
        finishHour: { $exists: false },
        assignedTo: { $exists: false },
      })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();
    // Oldest first and one at a time: each assignment changes who is free
    // for the next call, so parallel runs could pick the same person.
    for (const { _id } of pending) {
      try {
        await this.assign(_id);
      } catch (error) {
        this.logger.error(`Failed to assign button call ${_id}`, error);
      }
    }
  }

  // Every assignment, decline and take-over of game master and service
  // calls in the range, newest first.
  async findAssignmentEvents(query: CallReportQueryDto) {
    const filter: Record<string, unknown> = {
      type: { $in: ASSIGNED_CALL_TYPES },
      'assignmentHistory.0': { $exists: true },
    };
    if (query.location) filter.location = Number(query.location);
    if (query.after || query.before) {
      filter.date = {
        ...(query.after && { $gte: query.after }),
        ...(query.before && { $lte: query.before }),
      };
    }
    const calls = await this.buttonCallModel
      .find(filter)
      .select(
        'date location tableName type gmCallReason game assignmentHistory',
      )
      .lean();
    return calls
      .flatMap((call) =>
        toAssignmentEvents(call.assignmentHistory ?? []).map((event) => ({
          ...event,
          buttonCall: call._id,
          date: call.date,
          location: call.location,
          tableName: call.tableName,
          callType: call.type,
          gmCallReason: call.gmCallReason,
          // The game a decline was about, else the call's game.
          game: event.game ?? call.game,
        })),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          hourToSeconds(b.hour) - hourToSeconds(a.hour),
      );
  }

  private async findOpenCall(callId: number) {
    const call = await this.buttonCallModel.findById(callId).lean();
    if (!call || call.finishHour) {
      throw new NotFoundException('Call not found');
    }
    if (!isAssignedCallType(call.type)) {
      throw new BadRequestException(
        'Only game master and service calls are assigned',
      );
    }
    return call;
  }

  private async buildRequest(call: CallInfo): Promise<AssignmentRequest> {
    if (call.gmCallReason === GmCallReasonEnum.EXPLANATION) {
      return { reason: call.gmCallReason, game: call.game };
    }
    if (call.gmCallReason === GmCallReasonEnum.QUESTION) {
      // The table may name the game the question is about; it's their
      // current game unless they said they play another one.
      const gameplay = await this.findActiveGameplay(call);
      const activeGame = gameplay ? Number(gameplay.game) : undefined;
      const game = call.game ?? activeGame;
      return {
        reason: call.gmCallReason,
        game,
        // Whoever explained the game is asked first, if it's that game.
        mentorId:
          gameplay && game === activeGame
            ? (gameplay.mentor as unknown as string)
            : undefined,
      };
    }
    return { reason: call.gmCallReason };
  }

  // The game the table is currently playing: an unfinished gameplay if any,
  // otherwise the most recently started one.
  async getTableGame(location: number, tableName: string) {
    const gameplay = await this.findActiveGameplay({
      location,
      tableName,
      date: today(),
    });
    return { game: gameplay ? Number(gameplay.game) : null };
  }

  private async findActiveGameplay(
    call: Pick<CallInfo, 'tableName' | 'location' | 'date'>,
  ) {
    const table = await this.tableModel
      .findOne({
        name: call.tableName,
        location: call.location,
        date: call.date,
      })
      .sort({ _id: -1 })
      .select('gameplays')
      .lean();
    if (!table?.gameplays?.length) {
      return null;
    }
    const gameplays = await this.gameplayModel
      .find({ _id: { $in: table.gameplays } })
      .select('mentor game startHour finishHour')
      .lean();
    const byStart = (a: Gameplay, b: Gameplay) =>
      hourToSeconds(b.startHour) - hourToSeconds(a.startHour);
    return (
      gameplays.filter((g) => !g.finishHour).sort(byStart)[0] ??
      gameplays.sort(byStart)[0] ??
      null
    );
  }

  // Whether a table asking for an explanation of `game` gets someone now,
  // has to wait for a busy person in the cafe or for someone whose shift
  // starts later today, or can't be helped today at all. `excludedUsers`
  // (people who declined the call) don't count.
  async getGameAvailability(
    location: number,
    game: number,
    excludedUsers: string[] = [],
  ): Promise<{ status: GameAvailabilityStatus; availableFrom?: string }> {
    const date = today();
    const hour = nowHour();
    const candidates = await this.findCandidates(
      location,
      date,
      hour,
      excludedUsers,
    );
    if (candidates.some((c) => c.knownGames.has(game))) {
      return { status: GameAvailabilityStatus.AVAILABLE };
    }

    const [checkInByUser, { slots, locationShifts }] = await Promise.all([
      this.findCheckInByUser(location, date),
      this.findShiftSlots(location, date),
    ]);
    // Outside operation for the day: never takes the call, so not counted
    // (findScheduledStaff leaves them out too), except a game manager.
    const scheduled = findScheduledStaff(slots, hour, locationShifts);
    const outsideOperation = new Set(findOutsideOperationStaff(slots));
    // Service staff of the day take no game master calls.
    const serviceStaff = new Set(findServiceStaff(slots));
    const knowers = await this.userModel
      .find({
        _id: { $in: [...checkInByUser.keys(), ...scheduled.keys()] },
        active: true,
        ...gameMasterCallRoleFilter(date),
        'userGames.game': game,
      })
      .select('_id role')
      .lean();
    const roleById = new Map(
      knowers.map((user) => [user._id as string, Number(user.role)]),
    );
    const isWorking = (id: string) =>
      checkInByUser.has(id) &&
      (!outsideOperation.has(id) ||
        takesCallsOutsideOperation(roleById.get(id) ?? 0, false));
    const knowerIds = knowers
      .map((user) => user._id as string)
      .filter((id) => !excludedUsers.includes(id) && !serviceStaff.has(id));

    // Someone in the cafe who knows the game is busy.
    if (knowerIds.some(isWorking)) {
      return { status: GameAvailabilityStatus.BUSY };
    }
    const arrivals = knowerIds
      .filter((id) => !isWorking(id) && scheduled.has(id))
      .map((id) => scheduled.get(id)!)
      .sort((a, b) => hourToSeconds(a) - hourToSeconds(b));
    if (arrivals.length > 0) {
      return {
        status: GameAvailabilityStatus.LATER,
        availableFrom: arrivals[0],
      };
    }
    return { status: GameAvailabilityStatus.UNAVAILABLE };
  }

  // Earliest open check-in hour of everyone in the cafe.
  private async findCheckInByUser(location: number, date: string) {
    const visits = await this.visitModel
      .find({
        date,
        location,
        finishHour: { $exists: false },
        status: { $ne: VisitStatus.WRONG_ENTRY },
      })
      .select('user startHour')
      .lean();
    const checkInByUser = new Map<string, string>();
    for (const visit of visits) {
      const userId = visit.user as string;
      const current = checkInByUser.get(userId);
      if (!current || hourToSeconds(visit.startHour) < hourToSeconds(current)) {
        checkInByUser.set(userId, visit.startHour);
      }
    }
    return checkInByUser;
  }

  async findCandidates(
    location: number,
    date: string,
    hour: string,
    excludedUsers: string[],
    callType: ButtonCallTypeEnum = ButtonCallTypeEnum.GAMEMASTERCALL,
    tableName?: string,
    gmCallReason?: string,
  ): Promise<AssignmentCandidate[]> {
    const checkInByUser = await this.findCheckInByUser(location, date);
    const isServiceCall = isServiceCallType(callType);

    const [users, busyNow, shiftPlan, gameplays, calls, duty] =
      await Promise.all([
        this.userModel
          .find({
            _id: { $in: [...checkInByUser.keys()] },
            active: true,
            ...(isServiceCall
              ? { role: { $in: SERVICE_CALL_ROLES } }
              : gameMasterCallRoleFilter(date)),
          })
          .select('_id role userGames')
          .lean(),
        this.findBusyUserIds(location, date),
        this.findShiftSlots(location, date),
        this.gameplayModel
          .find({ date, location })
          .select('mentor startHour')
          .lean(),
        this.buttonCallModel
          .find({
            date,
            location,
            type: { $in: ASSIGNED_CALL_TYPES },
            assignedTo: { $exists: true },
          })
          .select('type gmCallReason assignedTo assignedHour finishHour')
          .lean(),
        this.upstairsDutyModel
          .findOne({ location, date, finishHour: { $exists: false } })
          .select('user')
          .lean(),
      ]);

    // Someone already handling a call gets no other call until it's closed.
    const openCalls = calls.filter((c) => !c.finishHour);
    const handlingCall = openCalls.map((c) => c.assignedTo);
    // The upstairs duty takes only upstairs calls (not the bar's call for
    // ready orders), first and possibly several at once.
    const dutyId = duty ? String(duty.user) : undefined;
    const isUpstairsCall =
      !!tableName &&
      callType !== ButtonCallTypeEnum.ORDERREADYCALL &&
      (await this.isUpstairs(location, date, tableName));
    const dutyTakesIt =
      !!dutyId &&
      isUpstairsCall &&
      upstairsDutyCanTake(
        openCalls.filter((c) => c.assignedTo === dutyId),
        { type: callType, gmCallReason },
      );
    // Without a table (e.g. asking who could explain a game) the duty
    // counts as anyone else.
    const dutyExcluded = !!dutyId && !!tableName && !dutyTakesIt;
    // Service staff and outside operation are set for the whole day.
    const serviceStaff = new Set(findServiceStaff(shiftPlan.slots));
    const outsideOperation = new Set(
      findOutsideOperationStaff(shiftPlan.slots),
    );
    const shiftEnds = findShiftEnds(shiftPlan.slots, shiftPlan.locationShifts);
    const excluded = new Set([
      ...busyNow.busy,
      // The middleman gets calls only through a stand-in (see assignNow).
      ...busyNow.middlemen,
      ...excludedUsers,
      ...handlingCall.filter((id) => !(dutyTakesIt && id === dutyId)),
      ...(dutyExcluded ? [dutyId] : []),
    ]);

    // Baristas, and the bar chef on a day they don't run the bar. Marked
    // service staff for the day, they work as service staff instead.
    const actsAsBarista = (userId: string, role: number) =>
      !serviceStaff.has(userId) &&
      (role === RoleEnum.BARISTA ||
        (role === RoleEnum.BARCHEF && !outsideOperation.has(userId)));
    const baristasCanHelp =
      isServiceCall &&
      users.some((user) =>
        actsAsBarista(user._id as string, Number(user.role)),
      ) &&
      !openCalls.some((c) => c.type === ButtonCallTypeEnum.ORDERCALL) &&
      // The bar's own call for ready orders comes from downstairs.
      (callType === ButtonCallTypeEnum.ORDERREADYCALL ||
        !(await this.isUpstairs(location, date, tableName))) &&
      !(await this.hasWaitingOrders(location));

    return (
      users
        .filter((user) => !excluded.has(user._id))
        // A game master working as service staff takes no game master calls.
        .filter((user) => isServiceCall || !serviceStaff.has(user._id))
        // Nobody starts a long game master call just before leaving.
        .filter(
          (user) =>
            isServiceCall ||
            !leavingTooSoonFor(
              gmCallReason,
              shiftEnds.get(user._id as string),
              hour,
            ),
        )
        // "Operasyon Dışı" take no calls, with the game manager exception.
        .filter(
          (user) =>
            !outsideOperation.has(user._id) ||
            takesCallsOutsideOperation(Number(user.role), isServiceCall),
        )
        .filter(
          (user) =>
            !actsAsBarista(user._id as string, Number(user.role)) ||
            baristasCanHelp,
        )
        .map((user) => {
          const userId = user._id as string;
          const role = Number(user.role);
          const isServiceStaff = serviceStaff.has(userId);
          const ownGameplays = gameplays.filter(
            (g) => (g.mentor as unknown as string) === userId,
          );
          const ownCalls = calls.filter((c) => c.assignedTo === userId);
          const activityHours = [
            checkInByUser.get(userId)!,
            ...ownGameplays.map((g) => g.startHour),
            // A call counts from when it was closed: whoever just finished
            // a long call goes to the back of the line.
            ...ownCalls
              .map((c) => c.finishHour ?? c.assignedHour)
              .filter(Boolean),
          ];
          return {
            userId,
            role,
            knownGames: new Set(
              (user.userGames ?? []).map((ug) => Number(ug.game)),
            ),
            lastActivity: Math.max(...activityHours.map(hourToSeconds)),
            gameplayCountToday: ownGameplays.length,
            recentRate: recentExplanationRate(
              ownGameplays.map((g) => g.startHour),
              checkInByUser.get(userId)!,
              hour,
            ),
            // GM marked service staff for the day, or someone in the service
            // role (only candidates for service calls).
            isServiceStaff: isServiceStaff || role === RoleEnum.SERVICE,
            tier:
              dutyTakesIt && userId === dutyId
                ? UPSTAIRS_DUTY_TIER
                : isServiceCall
                ? serviceCallTier(
                    role,
                    isServiceStaff,
                    actsAsBarista(userId, role),
                  )
                : gmCallTier(role, outsideOperation.has(userId)),
          };
        })
    );
  }

  // Tables from 20 up and event tables are upstairs; a call without a table
  // counts as upstairs, so no barista leaves the bar for it.
  private async isUpstairs(location: number, date: string, tableName?: string) {
    if (!tableName) return true;
    if (isUpstairsTableName(tableName)) return true;
    const table = await this.tableModel
      .findOne({ name: tableName, location, date })
      .sort({ _id: -1 })
      .select('type')
      .lean();
    return table?.type === TableTypes.ACTIVITY;
  }

  // An order of today at the location still waiting for confirmation or
  // being prepared. Orders held until the table's food is ready don't count.
  private async hasWaitingOrders(location: number) {
    const startOfToday = cafeStartOfToday();
    const waiting = await this.orderModel.exists({
      location,
      status: { $in: [OrderStatus.CONFIRMATIONREQ, OrderStatus.PENDING] },
      waitsForFood: { $ne: true },
      createdAt: { $gte: startOfToday },
    });
    return !!waiting;
  }

  // People explaining a game or on a break / busy right now, and the
  // middlemen.
  private async findBusyUserIds(location: number, date: string) {
    const open = { date, finishHour: { $exists: false } };
    const [explaining, onBreak, middlemen] = await Promise.all([
      this.gameplayTimeModel
        .find({ ...open, location })
        .select('user')
        .lean(),
      this.breakModel.find(open).select('user').lean(),
      this.findMiddlemanIds(date),
    ]);
    const ids = (records: { user: unknown }[]) =>
      records.map((record) => record.user as string);
    return {
      busy: [...ids(explaining), ...ids(onBreak)],
      middlemen,
    };
  }

  // The middlemen, and a middleman away on a call while someone stands in.
  private async findMiddlemanIds(date: string) {
    const records = await this.middlemanModel
      .find({ date, finishHour: { $exists: false } })
      .select('user coveringFor')
      .lean();
    return records.flatMap((r) =>
      [r.user, r.coveringFor].filter(Boolean).map(String),
    );
  }

  // The day's shift slots, with the location's shift definitions that hold
  // the end hour when a slot doesn't.
  private async findShiftSlots(location: number, date: string) {
    const [shift, locationDoc] = await Promise.all([
      this.shiftModel.findOne({ day: date, location }).select('shifts').lean(),
      this.locationModel.findById(location).select('shifts').lean(),
    ]);
    return {
      slots: shift?.shifts ?? [],
      locationShifts: locationDoc?.shifts ?? [],
    };
  }
}
