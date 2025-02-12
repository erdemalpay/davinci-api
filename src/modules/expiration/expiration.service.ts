import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { User } from '../user/user.schema';
import {
  CreateExpirationCountDto,
  CreateExpirationListDto,
} from './expiration.dto';
import { ExpirationGateway } from './expiration.gateway';
import { ExpirationCount } from './expirationCount.schema';
import { ExpirationList } from './expirationList.schema';

@Injectable()
export class ExpirationService {
  constructor(
    @InjectModel(ExpirationList.name)
    private expirationListModel: Model<ExpirationList>,
    @InjectModel(ExpirationCount.name)
    private expirationCountModel: Model<ExpirationCount>,
    private readonly expirationGateway: ExpirationGateway,
  ) {}

  findAllExpirationLists() {
    return this.expirationListModel.find();
  }

  async createExpirationList(
    user: User,
    createExpirationListDto: CreateExpirationListDto,
  ) {
    const expirationList = new this.expirationListModel(
      createExpirationListDto,
    );
    expirationList._id = usernamify(createExpirationListDto.name);
    expirationList.locations = [1, 2];
    expirationList.active = true;
    await expirationList.save();
    this.expirationGateway.emitExpirationListChanged(user, expirationList);
    return expirationList;
  }

  async updateExpirationList(
    user: User,
    id: string,
    updates: UpdateQuery<ExpirationList>,
  ) {
    const expirationList = await this.expirationListModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.expirationGateway.emitExpirationListChanged(user, expirationList);
    return expirationList;
  }

  findAllExpirationCounts() {
    return this.expirationCountModel
      .find()
      .sort({ isCompleted: 1, completedAt: -1 });
  }

  async createExpirationCount(
    user: User,
    createExpirationCountDto: CreateExpirationCountDto,
  ) {
    const existing = await this.expirationCountModel.find({
      user: createExpirationCountDto.user,
      location: createExpirationCountDto.location,
      expirationList: createExpirationCountDto.expirationList,
      isCompleted: false,
    });
    if (existing.length > 0) {
      throw new HttpException(
        'Expiration count already exists and not finished',
        HttpStatus.BAD_REQUEST,
      );
    }
    const expirationCount = new this.expirationCountModel(
      createExpirationCountDto,
    );
    expirationCount._id = usernamify(
      expirationCount.user + new Date().toISOString(),
    );
    this.expirationGateway.emitExpirationCountChanged(user, expirationCount);
    return expirationCount.save();
  }

  async updateExpirationCount(
    user: User,
    id: string,
    updates: UpdateQuery<ExpirationCount>,
  ) {
    const expirationCount = await this.expirationCountModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    this.expirationGateway.emitExpirationCountChanged(user, expirationCount);
    return expirationCount;
  }

  async removeExpirationCount(user: User, id: string) {
    const expirationCount = await this.expirationCountModel.findByIdAndRemove(
      id,
    );
    this.expirationGateway.emitExpirationCountChanged(user, expirationCount);
    return expirationCount;
  }
}
