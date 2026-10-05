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
import { Break } from '../break/break.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Middleman } from '../middleman/middleman.schema';
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
  findScheduledStaff,
  findServiceStaff,
  hourToSeconds,
  pickAssignee,
} from './buttonCall.assignment';
import {
  AssignmentActionEnum,
  ButtonCallActionEnum,
  ButtonCallTypeEnum,
  ChangeGmCallRequestDto,
  GameAvailabilityStatus,
  GmCallReasonEnum,
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';

const GM_ROLES = [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER];

type CallInfo = Pick<
  ButtonCall,
  'tableName' | 'location' | 'date' | 'gmCallReason' | 'game'
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
      call?.type !== ButtonCallTypeEnum.GAMEMASTERCALL ||
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
    );
    const request = await this.buildRequest(call);
    const userId = pickAssignee(candidates, request);
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

  async decline(user: User, callId: number): Promise<ButtonCall> {
    const call = await this.findOpenCall(callId);
    if (call.assignedTo !== user._id) {
      throw new BadRequestException('This call is not assigned to you');
    }
    const declined = await this.buttonCallModel.findOneAndUpdate(
      { _id: callId, assignedTo: user._id, finishHour: { $exists: false } },
      {
        $unset: { assignedTo: '', assignedHour: '' },
        $addToSet: { declinedBy: user._id },
        $push: {
          assignmentHistory: {
            user: user._id,
            action: AssignmentActionEnum.DECLINED,
            hour: nowHour(),
          },
        },
      },
      { new: true },
    );
    if (!declined) {
      throw new NotFoundException('Call not found');
    }
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
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      assignedTo: user._id,
      finishHour: { $exists: false },
    });
    if (otherOpenCall) {
      throw new BadRequestException(
        'You already have an assigned game master call. Close it before taking another one.',
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
  @Cron(CronExpression.EVERY_MINUTE)
  async assignPendingCalls() {
    const pending = await this.buttonCallModel
      .find({
        date: today(),
        type: ButtonCallTypeEnum.GAMEMASTERCALL,
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

  private async findOpenCall(callId: number) {
    const call = await this.buttonCallModel.findById(callId).lean();
    if (!call || call.finishHour) {
      throw new NotFoundException('Call not found');
    }
    if (call.type !== ButtonCallTypeEnum.GAMEMASTERCALL) {
      throw new BadRequestException('Only game master calls are assigned');
    }
    return call;
  }

  private async buildRequest(call: CallInfo): Promise<AssignmentRequest> {
    if (call.gmCallReason === GmCallReasonEnum.EXPLANATION) {
      return { reason: call.gmCallReason, game: call.game };
    }
    if (call.gmCallReason === GmCallReasonEnum.QUESTION) {
      const gameplay = await this.findActiveGameplay(call);
      return {
        reason: call.gmCallReason,
        game: gameplay?.game as unknown as number | undefined,
        mentorId: gameplay?.mentor as unknown as string | undefined,
      };
    }
    return { reason: call.gmCallReason };
  }

  // The game the table is currently playing: an unfinished gameplay if any,
  // otherwise the most recently started one.
  private async findActiveGameplay(call: CallInfo) {
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

    const [checkInByUser, shift] = await Promise.all([
      this.findCheckInByUser(location, date),
      this.shiftModel.findOne({ day: date, location }).select('shifts').lean(),
    ]);
    const slots = shift?.shifts ?? [];
    const serviceStaff = findServiceStaff(slots, hour);
    const scheduled = findScheduledStaff(slots, hour);
    const knowers = await this.userModel
      .find({
        _id: { $in: [...checkInByUser.keys(), ...scheduled.keys()] },
        active: true,
        role: { $in: GM_ROLES },
        'userGames.game': game,
      })
      .select('_id')
      .lean();
    const knowerIds = knowers
      .map((user) => user._id as string)
      .filter((id) => !excludedUsers.includes(id));

    // Service staff stay on service for their whole shift slot, so waiting
    // for them makes no sense.
    if (knowerIds.some((id) => checkInByUser.has(id) && id !== serviceStaff)) {
      return { status: GameAvailabilityStatus.BUSY };
    }
    const arrivals = knowerIds
      .filter((id) => !checkInByUser.has(id) && scheduled.has(id))
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
  ): Promise<AssignmentCandidate[]> {
    const checkInByUser = await this.findCheckInByUser(location, date);

    const [users, busyUserIds, serviceStaff, gameplays, calls] =
      await Promise.all([
        this.userModel
          .find({
            _id: { $in: [...checkInByUser.keys()] },
            active: true,
            role: { $in: GM_ROLES },
          })
          .select('_id userGames')
          .lean(),
        this.findBusyUserIds(location, date),
        this.findServiceStaffAt(location, date, hour),
        this.gameplayModel
          .find({ date, location })
          .select('mentor startHour')
          .lean(),
        this.buttonCallModel
          .find({
            date,
            location,
            type: ButtonCallTypeEnum.GAMEMASTERCALL,
            assignedTo: { $exists: true },
          })
          .select('assignedTo assignedHour finishHour')
          .lean(),
      ]);

    // Someone already handling a call gets no other call until it's closed.
    const handlingCall = calls
      .filter((c) => !c.finishHour)
      .map((c) => c.assignedTo);
    const excluded = new Set([
      ...busyUserIds,
      ...excludedUsers,
      ...handlingCall,
    ]);
    if (serviceStaff) {
      excluded.add(serviceStaff);
    }

    return users
      .filter((user) => !excluded.has(user._id))
      .map((user) => {
        const userId = user._id as string;
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
        };
      });
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

  private async findServiceStaffAt(
    location: number,
    date: string,
    hour: string,
  ) {
    const shift = await this.shiftModel
      .findOne({ day: date, location })
      .select('shifts')
      .lean();
    return findServiceStaff(shift?.shifts ?? [], hour);
  }
}
