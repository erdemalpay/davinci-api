import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { User } from '../user/user.schema';
import { CreateExpirationListDto } from './expiration.dto';
import { ExpirationGateway } from './expiration.gateway';
import { ExpirationList } from './expirationList.schema';

@Injectable()
export class ExpirationService {
  constructor(
    @InjectModel(ExpirationList.name)
    private expirationListModel: Model<ExpirationList>,
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
}
