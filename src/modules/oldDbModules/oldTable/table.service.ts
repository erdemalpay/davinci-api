import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Table } from './table.schema';

@Injectable()
export class OldTableService {
  constructor(@InjectModel(Table.name) private tableModel: Model<Table>) {}

  async getAll(): Promise<Table[]> {
    return this.tableModel
      .find({
        date: { $gt: '2022-07-01' },
      })
      .populate({
        path: 'gameplays',
        populate: {
          path: 'mentor',
        },
      });
    // .limit(10);
  }
}
