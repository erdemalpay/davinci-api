import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
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

@Injectable()
export class AssignmentService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<Assignment>,
    private readonly websocketGateway: AppWebSocketGateway,
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

    this.websocketGateway.emitAssignmentChanged();

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

    this.websocketGateway.emitAssignmentChanged();

    return createdAssignments;
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

    const sortStage: Record<string, 1 | -1> = {};
    if (sort) {
      const sortDirection: 1 | -1 = asc && Number(asc) === 1 ? 1 : -1;
      sortStage[sort] = sortDirection;
    } else {
      sortStage.statusSortPriority = 1;
      sortStage.createdAt = -1;
    }

    const userLookupPipeline = [
      { $project: { name: 1, fullName: 1, imageUrl: 1, role: 1 } },
    ];

    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $addFields: {
          statusSortPriority: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$status', AssignmentStatusEnum.OVERDUE] },
                  then: 0,
                },
                {
                  case: { $eq: ['$status', AssignmentStatusEnum.ASSIGNED] },
                  then: 1,
                },
                {
                  case: { $eq: ['$status', AssignmentStatusEnum.COMPLETED] },
                  then: 2,
                },
              ],
              default: 3,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedBy',
          pipeline: userLookupPipeline,
        },
      },
      { $unwind: { path: '$assignedBy', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedTo',
          pipeline: userLookupPipeline,
        },
      },
      { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: true } },
      { $sort: sortStage },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
      { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          data: 1,
          totalNumber: { $ifNull: ['$metadata.total', 0] },
        },
      },
    ];

    const results = await this.assignmentModel.aggregate(pipeline);
    const totalNumber = results[0]?.totalNumber ?? 0;
    const data = results[0]?.data ?? [];

    return {
      data,
      totalNumber,
      totalPages: Math.ceil(totalNumber / limitNum),
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
        ...(updateAssignmentDto.status &&
        updateAssignmentDto.status !== AssignmentStatusEnum.CANCELLED
          ? { cancelledAt: null }
          : {}),
        ...(updateAssignmentDto.status === AssignmentStatusEnum.COMPLETED
          ? { completedAt: new Date() }
          : {}),
        ...(updateAssignmentDto.status &&
        updateAssignmentDto.status !== AssignmentStatusEnum.COMPLETED
          ? { completedAt: null }
          : {}),
      },
      { new: true },
    );

    if (!assignment) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    this.websocketGateway.emitAssignmentChanged();

    return assignment;
  }

  async markOverdueAssignments(
    now: Date = new Date(),
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const result = await this.assignmentModel.updateMany(
      {
        status: AssignmentStatusEnum.ASSIGNED,
        dueDate: { $exists: true, $lte: now },
      },
      {
        $set: { status: AssignmentStatusEnum.OVERDUE, updatedAt: now },
      },
    );

    if (result.modifiedCount > 0) {
      this.websocketGateway.emitAssignmentChanged();
    }

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
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

    this.websocketGateway.emitAssignmentChanged();

    return assignment;
  }
}
