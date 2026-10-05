import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
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
  findServiceStaff,
  hourToSeconds,
  pickAssignee,
} from './buttonCall.assignment';
import {
  AssignmentActionEnum,
  ButtonCallActionEnum,
  ButtonCallTypeEnum,
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
  // unassigned when nobody is available; the cron retries later.
  async assign(callId: number): Promise<ButtonCall | null> {
    const call = await this.buttonCallModel.findById(callId).lean();
    if (
      !call ||
      call.type !== ButtonCallTypeEnum.GAMEMASTERCALL ||
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
    this.websocketGateway.emitButtonCallChanged(
      declined,
      ButtonCallActionEnum.ASSIGN,
    );
    return declined;
  }

  async claim(user: User, callId: number): Promise<ButtonCall> {
    await this.findOpenCall(callId);
    const hour = nowHour();
    const claimed = await this.buttonCallModel.findOneAndUpdate(
      { _id: callId, finishHour: { $exists: false } },
      {
        $set: { assignedTo: user._id, assignedHour: hour },
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

  // Picks up calls that could not be assigned when they were created, e.g.
  // because every game master was explaining a game or on a break.
  @Cron(CronExpression.EVERY_MINUTE)
  async assignPendingCalls() {
    const pending = await this.buttonCallModel
      .find({
        date: today(),
        type: ButtonCallTypeEnum.GAMEMASTERCALL,
        finishHour: { $exists: false },
        assignedTo: { $exists: false },
      })
      .select('_id')
      .lean();
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

  async findCandidates(
    location: number,
    date: string,
    hour: string,
    excludedUsers: string[],
  ): Promise<AssignmentCandidate[]> {
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

    const excluded = new Set([...busyUserIds, ...excludedUsers]);
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
          hasOpenAssignment: ownCalls.some((c) => !c.finishHour),
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
