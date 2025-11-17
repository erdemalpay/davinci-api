import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
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
    const { pointUser, status, before, after, sort, asc } = filter;
    const skip = (pageNum - 1) * limitNum;
    const statusArray = status ? (status as any).split(',') : [];
    const sortObject = {};

    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['createdAt'] = -1;
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(pointUser && { pointUser }),
          ...(status && {
            status: { $in: statusArray },
          }),
          ...(after &&
            before && {
              createdAt: { $gte: new Date(after), $lte: new Date(before) },
            }),
          ...(before && !after && { createdAt: { $lte: new Date(before) } }),
          ...(after && !before && { createdAt: { $gte: new Date(after) } }),
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
    const existingPoint = await this.pointModel.findOne({
      user: createPointDto.user,
    });

    if (existingPoint) {
      const oldAmount = existingPoint.amount;
      existingPoint.amount += createPointDto.amount;
      await existingPoint.save();
      this.websocketGateway.emitPointChanged(user, existingPoint);

      // Create point history
      await this.createPointHistory(
        {
          point: existingPoint._id,
          pointUser: existingPoint.user,
          createdBy: user._id,
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
        pointUser: point.user,
        createdBy: user._id,
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

  async findUserPoints(userId: string) {
    const point = await this.pointModel.findOne({ user: userId });
    if (!point) {
      throw new HttpException(
        'No points found for this user',
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
          pointUser: point.user,
          createdBy: user._id,
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
        pointUser: point.user,
        createdBy: user._id,
        status: PointHistoryStatusEnum.POINTDELETE,
        currentAmount: 0,
        change: -oldAmount,
      },
      user,
    );

    return point;
  }

  async consumePoint(
    userId: string,
    amount: number,
    collectionId: number,
    tableId?: number,
    createdBy?: string,
  ) {
    const userPoint = await this.pointModel.findOne({ user: userId });

    if (!userPoint) {
      throw new HttpException(
        'No points found for this user',
        HttpStatus.NOT_FOUND,
      );
    }

    if (userPoint.amount < amount) {
      throw new HttpException('Insufficient points', HttpStatus.BAD_REQUEST);
    }

    const oldAmount = userPoint.amount;
    userPoint.amount -= amount;
    await userPoint.save();

    this.websocketGateway.emitPointChanged(null, userPoint);

    // Create point history
    await this.createPointHistory({
      point: userPoint._id,
      pointUser: userPoint.user,
      createdBy: createdBy || userId,
      collectionId,
      tableId,
      status: PointHistoryStatusEnum.COLLECTIONCREATED,
      currentAmount: userPoint.amount,
      change: -amount,
    });

    return userPoint;
  }

  async refundPoint(
    userId: string,
    amount: number,
    collectionId: number,
    tableId?: number,
    createdBy?: string,
  ) {
    const userPoint = await this.pointModel.findOne({ user: userId });

    if (!userPoint) {
      throw new HttpException(
        'No points found for this user',
        HttpStatus.NOT_FOUND,
      );
    }

    const oldAmount = userPoint.amount;
    userPoint.amount += amount;
    await userPoint.save();

    this.websocketGateway.emitPointChanged(null, userPoint);

    // Create point history
    await this.createPointHistory({
      point: userPoint._id,
      pointUser: userPoint.user,
      createdBy: createdBy || userId,
      collectionId,
      tableId,
      status: PointHistoryStatusEnum.COLLECTIONCANCELLED,
      currentAmount: userPoint.amount,
      change: amount,
    });

    return userPoint;
  }
}
