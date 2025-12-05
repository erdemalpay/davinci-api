import { forwardRef, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
import { Consumer } from '../consumer/consumer.schema';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreatePointDto,
  CreatePointHistoryDto,
  PointHistoryFilter,
  PointHistoryStatusEnum,
} from './point.dto';
import { Point } from './point.schema';
import { PointHistory } from './pointHistory.schema';

@Injectable()
export class PointService {
  constructor(
    @InjectModel(Point.name)
    private pointModel: Model<Point>,
    @InjectModel(PointHistory.name)
    private pointHistoryModel: Model<PointHistory>,
    @InjectModel(Consumer.name)
    private consumerModel: Model<Consumer>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private websocketGateway: AppWebSocketGateway,
  ) {}

  async createPointHistory(
    createPointHistoryDto: CreatePointHistoryDto,
    user?: User,
  ): Promise<PointHistory> {
    const pointHistory = new this.pointHistoryModel({
      ...createPointHistoryDto,
      createdAt: new Date(),
    });
    await pointHistory.save();
    if (user) {
      this.websocketGateway.emitPointHistoryChanged(user, pointHistory);
    }
    return pointHistory;
  }

  findAllPointHistories() {
    return this.pointHistoryModel.find().sort({ createdAt: -1 });
  }

  async findAllPointHistoriesWithPagination(
    page: number,
    limit: number,
    filter: PointHistoryFilter,
  ) {
    const pageNum = page || 1;
    const limitNum = limit || 10;
    const { pointUser, pointConsumer, status, before, after, sort, asc, search } =
      filter;
    const skip = (pageNum - 1) * limitNum;
    const statusArray = status ? (status as any).split(',') : [];
    const sortObject: Record<string, 1 | -1> = {};

    if (sort) {
      sortObject[sort] = asc === 1 ? 1 : -1;
    } else {
      sortObject['createdAt'] = -1;
    }

    const matchStage: Record<string, any> = {
      ...(after &&
        before && {
          createdAt: { $gte: new Date(after), $lte: new Date(before) },
        }),
      ...(before && !after && { createdAt: { $lte: new Date(before) } }),
      ...(after && !before && { createdAt: { $gte: new Date(after) } }),
    };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchedConsumerIds = await this.consumerModel
        .find({ fullName: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      const searchedUserIds = await this.userModel
        .find({ name: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      matchStage.$or = [
        { pointUser: { $regex: searchRegex } },
        { status: { $regex: searchRegex } },
        { pointConsumer: { $in: searchedConsumerIds } },
        { createdBy: { $in: searchedUserIds } },
      ];
    } else {
      if (pointUser && Number(pointUser) !== -1) matchStage.pointUser = pointUser;
      if (Number(pointConsumer) && Number(pointConsumer) !== -1) matchStage.pointConsumer = pointConsumer;
      if (Number(pointUser) === -1) matchStage.pointUser = { $exists: false };
      if (Number(pointConsumer) === -1) matchStage.pointConsumer = { $exists: false };
      if (status) matchStage.status = { $in: statusArray };
    }

    const pipeline: PipelineStage[] = [
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'users',
          localField: 'pointUser',
          foreignField: '_id',
          as: 'pointUser',
          pipeline: [{ $project: { _id: 1, name: 1 } }],
        },
      },
      {
        $unwind: {
          path: '$pointUser',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'consumers',
          localField: 'pointConsumer',
          foreignField: '_id',
          as: 'pointConsumer',
          pipeline: [{ $project: { _id: 1, fullName: 1 } }],
        },
      },
      {
        $unwind: {
          path: '$pointConsumer',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdBy',
          pipeline: [{ $project: { _id: 1, name: 1 } }],
        },
      },
      {
        $unwind: {
          path: '$createdBy',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: sortObject,
      },
      {
        $facet: {
          metadata: [
            { $count: 'total' },
            {
              $addFields: {
                page: pageNum,
                pages: { $ceil: { $divide: ['$total', Number(limitNum)] } },
              },
            },
          ],
          data: [{ $skip: Number(skip) }, { $limit: Number(limitNum) }],
        },
      },
      {
        $unwind: '$metadata',
      },
      {
        $project: {
          data: 1,
          totalNumber: '$metadata.total',
          totalPages: '$metadata.pages',
          page: '$metadata.page',
          limit: limitNum,
        },
      },
    ];

    const results = await this.pointHistoryModel.aggregate(pipeline);

    if (!results.length) {
      return {
        data: [],
        totalNumber: 0,
        totalPages: 0,
        page: pageNum,
        limit: limitNum,
      };
    }

    return results[0];
  }

  async findUserPointHistories(userId: string) {
    return this.pointHistoryModel
      .find({ createdBy: userId })
      .sort({ createdAt: -1 });
  }

  async createPoint(user: User, createPointDto: CreatePointDto) {
    let query: any = {};
    if (createPointDto.user) query.user = createPointDto.user;
    if (createPointDto.consumer) query.consumer = createPointDto.consumer;
    const existingPoint = await this.pointModel.findOne(query);

    if (existingPoint) {
      const oldAmount = existingPoint.amount;
      existingPoint.amount += createPointDto.amount;
      await existingPoint.save();
      this.websocketGateway.emitPointChanged(user, existingPoint);

      // Create point history
      await this.createPointHistory(
        {
          point: existingPoint._id,
          ...(existingPoint.consumer
            ? { pointConsumer: existingPoint.consumer }
            : existingPoint.user
            ? { pointUser: existingPoint.user }
            : {}),
          createdBy: user?._id,
          status: PointHistoryStatusEnum.POINTCREATE,
          currentAmount: existingPoint.amount,
          change: createPointDto.amount,
        },
        user,
      );

      return existingPoint;
    }
    const point = new this.pointModel(createPointDto);
    await point.save();
    this.websocketGateway.emitPointChanged(user, point);

    // Create point history
    await this.createPointHistory(
      {
        point: point._id,
        ...(point.consumer
          ? { pointConsumer: point.consumer }
          : point.user
          ? { pointUser: point.user }
          : {}),
        createdBy: user?._id,
        status: PointHistoryStatusEnum.POINTCREATE,
        currentAmount: point.amount,
        change: createPointDto.amount,
      },
      user,
    );

    return point;
  }

  findAllPoints() {
    return this.pointModel.find();
  }

  async findUserPoints(userId: string, consumerId?: number) {
    let query: any = {};
    if (userId) query.user = userId;
    if (consumerId) query.consumer = consumerId;
    const point = await this.pointModel.findOne(query);
    if (!point) {
      throw new HttpException(
        'No points found for this user/consumer',
        HttpStatus.NOT_FOUND,
      );
    }
    return point;
  }

  async updatePoint(user: User, id: number, updates: UpdateQuery<Point>) {
    const oldPoint = await this.pointModel.findById(id);
    if (!oldPoint) {
      throw new HttpException('Point not found', HttpStatus.NOT_FOUND);
    }

    const oldAmount = oldPoint.amount;
    const point = await this.pointModel.findByIdAndUpdate(id, updates, {
      new: true,
    });

    this.websocketGateway.emitPointChanged(user, point);

    // Create point history if amount changed
    if (updates.amount !== undefined && updates.amount !== oldAmount) {
      await this.createPointHistory(
        {
          point: point._id,
          ...(point.consumer
            ? { pointConsumer: point.consumer }
            : point.user
            ? { pointUser: point.user }
            : {}),
          createdBy: user?._id,
          status: PointHistoryStatusEnum.POINTUPDATE,
          currentAmount: point.amount,
          change: point.amount - oldAmount,
        },
        user,
      );
    }

    return point;
  }

  async removePoint(user: User, id: number) {
    const oldPoint = await this.pointModel.findById(id);
    if (!oldPoint) {
      throw new HttpException('Point not found', HttpStatus.NOT_FOUND);
    }

    const oldAmount = oldPoint.amount;
    const point = await this.pointModel.findByIdAndUpdate(
      id,
      { amount: 0 },
      { new: true },
    );

    this.websocketGateway.emitPointChanged(user, point);

    // Create point history
    await this.createPointHistory(
      {
        point: point._id,
        ...(point.consumer
          ? { pointConsumer: point.consumer }
          : point.user
          ? { pointUser: point.user }
          : {}),
        createdBy: user?._id,
        status: PointHistoryStatusEnum.POINTDELETE,
        currentAmount: 0,
        change: -oldAmount,
      },
      user,
    );

    return point;
  }

  async consumePoint(
    userId: string | null,
    amount: number,
    collectionId: number,
    tableId?: number,
    createdBy?: string,
    consumerId?: number,
  ) {
    let query: any = {};
    if (userId) query.user = userId;
    if (consumerId) query.consumer = consumerId;

    const point = await this.pointModel.findOne(query);

    if (!point) {
      throw new HttpException(
        'No points found for this user/consumer',
        HttpStatus.NOT_FOUND,
      );
    }

    if (point.amount < amount) {
      throw new HttpException('Insufficient points', HttpStatus.BAD_REQUEST);
    }

    const oldAmount = point.amount;
    point.amount -= amount;
    await point.save();

    this.websocketGateway.emitPointChanged(null, point);

    // Create point history
    await this.createPointHistory({
      point: point._id,
      ...(point.consumer
        ? { pointConsumer: point.consumer }
        : point.user
        ? { pointUser: point.user }
        : {}),
      createdBy: createdBy || userId,
      collectionId,
      tableId,
      status: PointHistoryStatusEnum.COLLECTIONCREATED,
      currentAmount: point.amount,
      change: -amount,
    });

    return point;
  }

  async refundPoint(
    userId: string | null,
    amount: number,
    collectionId: number,
    tableId?: number,
    createdBy?: string,
    consumerId?: number,
  ) {
    let query: any = {};
    if (userId) query.user = userId;
    if (consumerId) query.consumer = consumerId;

    const point = await this.pointModel.findOne(query);

    if (!point) {
      throw new HttpException(
        'No points found for this user/consumer',
        HttpStatus.NOT_FOUND,
      );
    }

    point.amount += amount;
    await point.save();

    this.websocketGateway.emitPointChanged(null, point);

    // Create point history
    await this.createPointHistory({
      point: point._id,
      ...(point.user && { pointUser: point.user }),
      ...(point.consumer && { pointConsumer: point.consumer }),
      createdBy: createdBy || userId,
      collectionId,
      tableId,
      status: PointHistoryStatusEnum.COLLECTIONCANCELLED,
      currentAmount: point.amount,
      change: amount,
    });

    return point;
  }
}
