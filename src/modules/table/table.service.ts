import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Table } from './table.schema';
import { TableDto } from './table.dto';

@Injectable()
export class TableService {
  constructor(@InjectModel(Table.name) private tableModel: Model<Table>) {}

  async create(tableDto: TableDto) {
    return this.tableModel.create(tableDto);
  }

  async findById(_id: string): Promise<Table | undefined> {
    return this.tableModel.findOne({ _id });
  }

  async getByLocation(location: number): Promise<Table[]> {
    return this.tableModel.find({ location });
  }
}
