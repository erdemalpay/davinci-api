import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { CreatePointDto } from './point.dto';
import { PointGateway } from './point.gateway';
import { Point } from './point.schema';

@Injectable()
export class PointService {
  constructor(
    @InjectModel(Point.name)
    private pointModel: Model<Point>,
    private pointGateway: PointGateway,
  ) {}

  async createPoint(user: User, createPointDto: CreatePointDto) {
    const existingPoint = await this.pointModel.findOne({
      user: createPointDto.user,
    });

    if (existingPoint) {
      existingPoint.amount += createPointDto.amount;
      await existingPoint.save();
      this.pointGateway.emitPointChanged(user, existingPoint);
      return existingPoint;
    }
    const point = new this.pointModel(createPointDto);
    await point.save();
    this.pointGateway.emitPointChanged(user, point);
    return point;
  }

  findAllPoints() {
    return this.pointModel.find();
  }

  async findUserPoints(userId: number) {
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
    const point = await this.pointModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!point) {
      throw new HttpException('Point not found', HttpStatus.NOT_FOUND);
    }
    this.pointGateway.emitPointChanged(user, point);
    return point;
  }

  async removePoint(user: User, id: number) {
    const point = await this.pointModel.findByIdAndRemove(id);
    if (!point) {
      throw new HttpException('Point not found', HttpStatus.NOT_FOUND);
    }
    this.pointGateway.emitPointChanged(user, point);
    return point;
  }
}
