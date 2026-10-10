import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
import { STAFF_AVAILABILITY_CHANGED } from '../../lib/events';
import { BreakTypeEnum } from '../break/break.dto';
import { Break } from '../break/break.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Location } from '../location/location.schema';
import { Middleman } from '../middleman/middleman.schema';
import { OrderStatus } from '../order/order.dto';
import { Order } from '../order/order.schema';
import { Shift } from '../shift/shift.schema';
import { Table } from '../table/table.schema';
import { RoleEnum } from '../user/user.dto';
import { User } from '../user/user.schema';
import { VisitStatus } from '../visit/visit.dto';
import { Visit } from '../visit/visit.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  AssignmentCandidate,
  AssignmentRequest,
  findOutsideOperationStaff,
  findScheduledStaff,
  findServiceStaff,
  hourToSeconds,
  pickAssigneeByTier,
  toAssignmentEvents,
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
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';

// Who can get which call, in tiers (lower tiers are asked first).
//
// Game master calls: game masters, then the game manager, then the day's
// service staff, then managers who opted in for the day and a game manager
// marked outside operation.
//
// Service calls: service staff (service role or the GM marked service staff
// for the day), then game masters, then the game manager, then baristas
// (only while no order is waiting), then the bar chef.
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

// The one exception to "outside operation gets no call": a game manager may
// still take game master calls, as the very last resort.
const takesCallsOutsideOperation = (role: number, isServiceCall: boolean) =>
  !isServiceCall && role === RoleEnum.GAMEMANAGER;

function gmCallTier(
  role: number,
  isServiceStaff: boolean,
  isOutsideOperation: boolean,
) {
  if (role === RoleEnum.MANAGER || isOutsideOperation) return 3;
  if (role === RoleEnum.GAMEMANAGER) return 1;
  return isServiceStaff ? 2 : 0;
}

function serviceCallTier(role: number, isServiceStaff: boolean) {
  if (isServiceStaff || role === RoleEnum.SERVICE) return 0;
  switch (role) {
    case RoleEnum.GAMEMASTER:
      return 1;
    case RoleEnum.GAMEMANAGER:
      return 2;
    case RoleEnum.BARISTA:
      return 3;
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
  [DeclineReasonEnum.TAKING_PAYMENT]: BreakTypeEnum.TAKING_PAYMENT,
  [DeclineReasonEnum.RECOMMENDING_GAME]: BreakTypeEnum.RECOMMENDING_GAME,
  [DeclineReasonEnum.PREPARING_ORDER]: BreakTypeEnum.PREPARING_ORDER,
  [DeclineReasonEnum.OTHER]: BreakTypeEnum.OTHER,
};

type CallInfo = Pick<
  ButtonCall,
  'tableName' | 'location' | 'date' | 'gmCallReason' | 'game' | 'declinedBy'
>;

const today = () => format(new Date(), 'yyyy-MM-dd');
const nowHour = () => format(new Date(), 'HH:mm:ss');

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
    );
    const userId = pickAssigneeByTier(
      candidates,
      call.type === ButtonCallTypeEnum.ORDERCALL
        ? {}
        : await this.buildRequest(call),
    );
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
      this.websocketGateway.emitButtonCallChanged(
        assigned,
        ButtonCallActionEnum.ASSIGN,
      );
    }
    return assigned;
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
        $addToSet: { declinedBy: user._id },
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
    await this.breakModel.create({
      user: user._id,
      location: call.location,
      date,
      startHour: format(new Date(), 'HH:mm'),
      type,
      ...(type === BreakTypeEnum.OTHER && { note: dto.note?.trim() }),
    });
    this.websocketGateway.emitBreakChanged();
  }

  // An explanation call stays in line for someone who knows the game. When
  // everyone who knows it (in the cafe or arriving later today) has declined,
  // flag the call so the table can pick another game.
  private async flagIfNoExplainerLeft(call: ButtonCall) {
    if (call.gmCallReason !== GmCallReasonEnum.EXPLANATION || !call.game) {
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
      // Anyone may answer only when nobody in the cafe knows the game.
      const knowerInCafe =
        game !== undefined &&
        [
          GameAvailabilityStatus.AVAILABLE,
          GameAvailabilityStatus.BUSY,
        ].includes(
          (
            await this.getGameAvailability(
              call.location,
              game,
              call.declinedBy ?? [],
            )
          ).status,
        );
      return {
        reason: call.gmCallReason,
        game,
        knowerInCafe,
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
        takesCallsOutsideOperation(roleById.get(id)!, false));
    const knowerIds = knowers
      .map((user) => user._id as string)
      .filter((id) => !excludedUsers.includes(id));

    // Someone in the cafe who knows the game is busy (service staff included:
    // they take GM calls as a last resort once free).
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
  ): Promise<AssignmentCandidate[]> {
    const checkInByUser = await this.findCheckInByUser(location, date);
    const isServiceCall = callType === ButtonCallTypeEnum.ORDERCALL;

    const [users, busyUserIds, shiftPlan, gameplays, calls] = await Promise.all(
      [
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
          .select('assignedTo assignedHour finishHour')
          .lean(),
      ],
    );

    // Someone already handling a call gets no other call until it's closed.
    const handlingCall = calls
      .filter((c) => !c.finishHour)
      .map((c) => c.assignedTo);
    // Service staff and outside operation are set for the whole day.
    const serviceStaff = new Set(findServiceStaff(shiftPlan.slots));
    const outsideOperation = new Set(
      findOutsideOperationStaff(shiftPlan.slots),
    );
    const excluded = new Set([
      ...busyUserIds,
      ...excludedUsers,
      ...handlingCall,
    ]);

    // Baristas only help with service calls while the bar has no order
    // waiting.
    const baristasCanHelp =
      isServiceCall &&
      users.some((user) => Number(user.role) === RoleEnum.BARISTA) &&
      !(await this.hasWaitingOrders(location));

    return (
      users
        .filter((user) => !excluded.has(user._id))
        // "Operasyon Dışı" take no calls, with the game manager exception.
        .filter(
          (user) =>
            !outsideOperation.has(user._id) ||
            takesCallsOutsideOperation(Number(user.role), isServiceCall),
        )
        .filter(
          (user) =>
            Number(user.role) !== RoleEnum.BARISTA ||
            serviceStaff.has(user._id) ||
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
            ...ownCalls.map((c) => c.assignedHour).filter(Boolean),
          ];
          return {
            userId,
            knownGames: new Set(
              (user.userGames ?? []).map((ug) => Number(ug.game)),
            ),
            lastActivity: Math.max(...activityHours.map(hourToSeconds)),
            gameplayCountToday: ownGameplays.length,
            // GM marked service staff for the day, or someone in the service
            // role (only candidates for service calls).
            isServiceStaff: isServiceStaff || role === RoleEnum.SERVICE,
            tier: isServiceCall
              ? serviceCallTier(role, isServiceStaff)
              : gmCallTier(role, isServiceStaff, outsideOperation.has(userId)),
          };
        })
    );
  }

  // An order of today at the location still waiting for confirmation or
  // being prepared.
  private async hasWaitingOrders(location: number) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const waiting = await this.orderModel.exists({
      location,
      status: { $in: [OrderStatus.CONFIRMATIONREQ, OrderStatus.PENDING] },
      createdAt: { $gte: startOfToday },
    });
    return !!waiting;
  }

  // People explaining a game, on a break or working as middleman right now.
  private async findBusyUserIds(location: number, date: string) {
    const open = { date, finishHour: { $exists: false } };
    const [explaining, onBreak, middlemen] = await Promise.all([
      this.gameplayTimeModel
        .find({ ...open, location })
        .select('user')
        .lean(),
      this.breakModel.find(open).select('user').lean(),
      this.middlemanModel.find(open).select('user').lean(),
    ]);
    return [...explaining, ...onBreak, ...middlemen].map(
      (record) => record.user as unknown as string,
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
