import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import {
  AssignmentPriorityEnum,
  AssignmentQueryDto,
  AssignmentStatusEnum,
  AssignmentTypeEnum,
  CreateAssignmentDto,
  CreateGameAssignmentDto,
  UpdateAssignmentDto,
} from './assignment.dto';
import { Assignment } from './assignment.schema';

export interface AssignmentReminderResult {
  fiveDayReminders: number;
  oneDayReminders: number;
  managersInformed: number;
  failures: number;
}

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<Assignment>,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  private normalizeQueryValues(value?: string | string[]) {
    if (!value) {
      return [] as string[];
    }

    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => item.trim()).filter(Boolean);
  }

  private normalizeSubjectEntityValues(value?: string | string[]) {
    if (!value) {
      return [] as Array<string | number>;
    }

    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (/^-?\d+$/.test(item) ? Number(item) : item));
  }

  async createAssignment(
    createAssignmentDto: CreateAssignmentDto,
  ): Promise<Assignment> {
    if (!createAssignmentDto.assignedTo) {
      throw new HttpException(
        'Assigned user is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const assignment = await this.assignmentModel.create({
      ...createAssignmentDto,
      status: createAssignmentDto.status ?? AssignmentStatusEnum.DRAFT,
      priority: createAssignmentDto.priority ?? AssignmentPriorityEnum.MEDIUM,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return assignment;
  }

  async createGameAssignments(
    createGameAssignmentDto: CreateGameAssignmentDto,
  ): Promise<Assignment[]> {
    const uniqueAssignedUsers = Array.from(
      new Set(
        (createGameAssignmentDto.assignUsers ?? [])
          .map((userId) => userId?.trim())
          .filter(Boolean),
      ),
    );

    if (uniqueAssignedUsers.length === 0) {
      throw new HttpException(
        'At least one assigned user is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    if (createGameAssignmentDto.dueDate < now) {
      throw new HttpException(
        'Due date cannot be earlier than the creation date',
        HttpStatus.BAD_REQUEST,
      );
    }

    const baseData = {
      title: createGameAssignmentDto.title ?? 'Game Assignment',
      description: createGameAssignmentDto.description,
      assignmentType: AssignmentTypeEnum.GAME_LEARNING,
      assignedBy: createGameAssignmentDto.assignedBy,
      subject: {
        entityType: 'game',
        entityId: createGameAssignmentDto.gameId,
      },
      dueDate: createGameAssignmentDto.dueDate,
      status: AssignmentStatusEnum.ASSIGNED,
      priority:
        createGameAssignmentDto.priority ?? AssignmentPriorityEnum.MEDIUM,
      payload: createGameAssignmentDto.payload ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const createdAssignments: Assignment[] = [];

    for (const assignedUserId of uniqueAssignedUsers) {
      const assignment = await this.assignmentModel.create({
        ...baseData,
        assignedTo: assignedUserId,
      });

      createdAssignments.push(assignment);
    }

    return createdAssignments;
  }

  async processGameAssignmentReminders(
    now: Date = new Date(),
  ): Promise<AssignmentReminderResult> {
    const today = moment(now).tz('Europe/Istanbul').startOf('day');
    const fiveDayStart = today.clone().add(5, 'days').toDate();
    const fiveDayEnd = today.clone().add(6, 'days').toDate();
    const oneDayStart = today.clone().add(1, 'day').toDate();
    const oneDayEnd = today.clone().add(2, 'days').toDate();

    const assignments = await this.assignmentModel
      .find({
        assignmentType: AssignmentTypeEnum.GAME_LEARNING,
        status: AssignmentStatusEnum.ASSIGNED,
        dueDate: { $exists: true },
        $or: [
          {
            dueDate: { $gte: fiveDayStart, $lt: fiveDayEnd },
            fiveDayReminderSentAt: { $exists: false },
          },
          {
            dueDate: { $gte: oneDayStart, $lt: oneDayEnd },
            oneDayReminderSentAt: { $exists: false },
          },
          {
            dueDate: { $lt: now },
            managerInformedAt: { $exists: false },
          },
        ],
      })
      .lean()
      .exec();

    const result: AssignmentReminderResult = {
      fiveDayReminders: 0,
      oneDayReminders: 0,
      managersInformed: 0,
      failures: 0,
    };

    for (const assignment of assignments) {
      try {
        const dueDate = new Date(assignment.dueDate as Date);
        const dueTime = dueDate.getTime();
        let notification;
        let timestampUpdate: Record<string, Date>;
        let resultKey:
          | 'fiveDayReminders'
          | 'oneDayReminders'
          | 'managersInformed';

        if (dueTime < now.getTime()) {
          notification = await this.notificationService.createNotification({
            type: NotificationType.WARNING,
            selectedUsers: [String(assignment.assignedBy)],
            seenBy: [],
            event: NotificationEventType.GAMEASSIGNMENTOVERDUE,
            message: {
              key: 'GameAssignmentOverdue',
              params: {
                assignmentId: assignment._id,
                title: assignment.title,
                assignedTo: String(assignment.assignedTo),
                dueDate: dueDate.toISOString(),
              },
            },
          });
          timestampUpdate = { managerInformedAt: now };
          resultKey = 'managersInformed';
        } else {
          const isFiveDayReminder =
            dueTime >= fiveDayStart.getTime() && dueTime < fiveDayEnd.getTime();
          const daysRemaining = isFiveDayReminder ? 5 : 1;

          notification = await this.notificationService.createNotification({
            type: NotificationType.INFORMATION,
            selectedUsers: [String(assignment.assignedTo)],
            seenBy: [],
            event: NotificationEventType.GAMEASSIGNMENTREMINDER,
            message: {
              key: 'GameAssignmentDueReminder',
              params: {
                assignmentId: assignment._id,
                title: assignment.title,
                dueDate: dueDate.toISOString(),
                daysRemaining,
              },
            },
          });
          timestampUpdate = isFiveDayReminder
            ? { fiveDayReminderSentAt: now }
            : { oneDayReminderSentAt: now };
          resultKey = isFiveDayReminder
            ? 'fiveDayReminders'
            : 'oneDayReminders';
        }

        if (!notification) {
          continue;
        }

        await this.assignmentModel.findByIdAndUpdate(
          assignment._id,
          timestampUpdate,
        );
        result[resultKey] += 1;
      } catch (error) {
        result.failures += 1;
        this.logger.error(
          `Failed to process game assignment reminder ${assignment._id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return result;
  }

  async getAllAssignments(query: AssignmentQueryDto) {
    const {
      search,
      status,
      assignmentType,
      priority,
      assignedBy,
      assignedTo,
      subjectEntityType,
      subjectEntityId,
      subjectId,
      after,
      before,
      page = 1,
      limit = 50,
      sort,
      asc,
    } = query;

    const filter: Record<string, unknown> = {};
    const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

    if (status) {
      const statusArray = status
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      filter.status =
        statusArray.length > 1
          ? { $in: statusArray }
          : statusArray[0] ?? status;
    }
    if (assignmentType) {
      const assignmentTypeArray = assignmentType
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      filter.assignmentType =
        assignmentTypeArray.length > 1
          ? { $in: assignmentTypeArray }
          : assignmentTypeArray[0] ?? assignmentType;
    }
    if (priority) {
      filter.priority = priority;
    }
    if (assignedBy) {
      const assignedByArray = assignedBy
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      filter.assignedBy =
        assignedByArray.length > 1
          ? { $in: assignedByArray }
          : assignedByArray[0] ?? assignedBy;
    }
    if (assignedTo) {
      const assignedToArray = assignedTo
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      filter.assignedTo =
        assignedToArray.length > 1
          ? { $in: assignedToArray }
          : assignedToArray[0] ?? assignedTo;
    }
    if (subjectEntityType) {
      filter['subject.entityType'] = subjectEntityType;
    }
    const subjectEntityIds = this.normalizeSubjectEntityValues(
      subjectId ?? subjectEntityId,
    );
    if (subjectEntityIds.length > 0) {
      filter['subject.entityId'] =
        subjectEntityIds.length > 1
          ? { $in: subjectEntityIds }
          : subjectEntityIds[0];
    }
    if (search) {
      filter.$or = [
        { title: { $regex: new RegExp(search, 'i') } },
        { description: { $regex: new RegExp(search, 'i') } },
        { assignmentType: { $regex: new RegExp(search, 'i') } },
        { 'subject.entityType': { $regex: new RegExp(search, 'i') } },
      ];
    }

    if (after) {
      let startUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(after)) {
        const [year, month, day] = after.split('-').map(Number);
        const istStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        startUtc = new Date(istStart.getTime() - IST_OFFSET_MS);
      } else {
        const parsedDate = new Date(after);
        startUtc = new Date(parsedDate.getTime() - IST_OFFSET_MS);
      }
      filter.createdAt = { $gte: startUtc };
    }

    if (before) {
      let endUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(before)) {
        const [year, month, day] = before.split('-').map(Number);
        const istEnd = new Date(
          Date.UTC(year, month - 1, day, 23, 59, 59, 999),
        );
        endUtc = new Date(istEnd.getTime() - IST_OFFSET_MS);
      } else {
        const parsedDate = new Date(before);
        endUtc = new Date(parsedDate.getTime() - IST_OFFSET_MS);
      }
      filter.createdAt = {
        ...(typeof filter.createdAt === 'object' && filter.createdAt !== null
          ? filter.createdAt
          : {}),
        $lte: endUtc,
      };
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const sortDirection: 1 | -1 = asc && Number(asc) === 1 ? 1 : -1;
      sortObject[sort] = sortDirection;
    } else {
      sortObject.createdAt = -1;
    }

    const totalNumber = await this.assignmentModel.countDocuments(filter);
    const totalPages = Math.ceil(totalNumber / limitNum);

    const data = await this.assignmentModel
      .find(filter)
      .populate('assignedBy', 'name fullName imageUrl role')
      .populate('assignedTo', 'name fullName imageUrl role')
      .sort(sortObject)
      .skip(skip)
      .limit(limitNum)
      .exec();

    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  async findById(id: string | number): Promise<Assignment | null> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (Number.isNaN(numericId)) {
      return null;
    }

    return this.assignmentModel
      .findById(numericId)
      .populate('assignedBy', 'name fullName imageUrl role')
      .populate('assignedTo', 'name fullName imageUrl role')
      .exec();
  }

  async updateAssignment(
    id: string | number,
    updateAssignmentDto: UpdateAssignmentDto,
  ): Promise<Assignment> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (Number.isNaN(numericId)) {
      throw new HttpException('Invalid assignment ID', HttpStatus.BAD_REQUEST);
    }

    const currentAssignment = await this.assignmentModel.findById(numericId);

    if (!currentAssignment) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    const assignment = await this.assignmentModel.findByIdAndUpdate(
      numericId,
      {
        ...updateAssignmentDto,
        updatedAt: new Date(),
        ...(updateAssignmentDto.status === AssignmentStatusEnum.CANCELLED
          ? { cancelledAt: new Date() }
          : {}),
      },
      { new: true },
    );

    if (!assignment) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    return assignment;
  }

  async deleteAssignment(id: string | number): Promise<Assignment> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (Number.isNaN(numericId)) {
      throw new HttpException('Invalid assignment ID', HttpStatus.BAD_REQUEST);
    }

    const assignment = await this.assignmentModel.findById(numericId);

    if (!assignment) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    assignment.status = AssignmentStatusEnum.CANCELLED;
    assignment.cancelledAt = new Date();
    assignment.updatedAt = new Date();

    await assignment.save();
    return assignment;
  }
}
