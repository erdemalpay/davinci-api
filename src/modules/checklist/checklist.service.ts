import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { usernamify } from 'src/utils/usernamify';
import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { Check } from './check.schema';
import {
  CheckQueryDto,
  CreateCheckDto,
  CreateChecklistDto,
} from './checklist.dto';
import { Checklist } from './checklist.schema';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectModel(Checklist.name)
    private checklistModel: Model<Checklist>,
    @InjectModel(Check.name) private checkModel: Model<Check>,
    private websocketGateway: AppWebSocketGateway,
    private readonly notificationService: NotificationService,
  ) {}

  async createChecklist(user: User, createChecklistDto: CreateChecklistDto) {
    const checklist = new this.checklistModel(createChecklistDto);
    checklist._id = usernamify(checklist.name);
    checklist.locations = [1, 2];
    checklist.active = true;
    await checklist.save();
    this.websocketGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }

  findAllChecklist() {
    return this.checklistModel.find();
  }

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  async findQueryChecks(query: CheckQueryDto) {
    const {
      page = 1,
      limit = 10,
      createdBy,
      checklist,
      location,
      date,
      after,
      before,
      sort,
      asc,
    } = query;
    const filter: FilterQuery<Check> = {};
    if (createdBy) filter.user = createdBy;
    if (checklist) filter.checklist = checklist;
    if (location !== undefined && location !== null && `${location}` !== '') {
      const locNum =
        typeof location === 'string' ? Number(location) : (location as number);
      if (!Number.isNaN(locNum)) filter.location = locNum;
    }
    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        filter.createdAt = rangeFilter;
      }
    }
    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const [data, totalNumber] = await Promise.all([
      this.checkModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.checkModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(totalNumber / limitNum);
    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  async updateChecklist(
    user: User,
    id: string,
    updates: UpdateQuery<Checklist>,
  ) {
    const checklist = await this.checklistModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }
  async setChecklistsOrder() {
    const checklists = await this.checklistModel.find();
    for (const checklist of checklists) {
      checklist.duties = checklist.duties.map((duty, index) => ({
        ...duty,
        order: index,
      }));
      await checklist.save();
    }
  }

  async removeChecklist(user: User, id: string) {
    const checks = await this.checkModel.find({ checklist: id });
    if (checks.length > 0) {
      throw new HttpException(
        'Cannot remove a checklist',
        HttpStatus.BAD_REQUEST,
      );
    }
    const checklist = await this.checklistModel.findByIdAndRemove(id);
    this.websocketGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }

  findAllChecks() {
    return this.checkModel.find().sort({ isCompleted: 1, completedAt: -1 });
  }

  async createCheck(user: User, createCheckDto: CreateCheckDto) {
    const checks = await this.checkModel.find({
      isCompleted: false,
      user: createCheckDto.user,
      location: createCheckDto.location,
      checklist: createCheckDto.checklist,
    });
    if (checks.length > 0) {
      throw new HttpException(
        'Check already exists and not finished',
        HttpStatus.BAD_REQUEST,
      );
    }
    const check = new this.checkModel(createCheckDto);
    check._id = usernamify(check.user + new Date().toISOString());
    this.websocketGateway.emitCheckChanged(user, check);
    return check.save();
  }

  async updateCheck(user: User, id: string, updates: UpdateQuery<Check>) {
    const check = await this.checkModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (updates?.isCompleted) {
      const unCompletedDuties = check?.duties?.filter(
        (duty) => !duty.isCompleted,
      );
      const message = {
        key: 'UncompletedDuties',
        params: {
          count: unCompletedDuties.length,
          dutyWord: unCompletedDuties.length === 1 ? 'duty' : 'duties',
          checklist: check.checklist,
          user: check.user,
          navigate: `/check-archive/${check._id}`,
        },
      };
      const notificationEvents =
        await this.notificationService.findAllEventNotifications();
      const unCompletedChecklistEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.UNCOMPLETEDCHECKLIST,
      );

      if (unCompletedDuties?.length > 0) {
        await this.notificationService.createNotification({
          type: unCompletedChecklistEvent?.type ?? NotificationType.INFORMATION, // ✅ DB'den
          createdBy: unCompletedChecklistEvent.createdBy, // ✅ DB'den
          selectedUsers: unCompletedChecklistEvent.selectedUsers,
          selectedLocations: unCompletedChecklistEvent.selectedLocations,
          selectedRoles: unCompletedChecklistEvent.selectedRoles,
          seenBy: [],
          event: NotificationEventType.UNCOMPLETEDCHECKLIST,
          message,
        });
      }
    }
    this.websocketGateway.emitCheckChanged(user, check);
    return check;
  }

  async removeCheck(user: User, id: string) {
    const check = await this.checkModel.findByIdAndRemove(id);
    this.websocketGateway.emitCheckChanged(user, check);
    return check;
  }
}
