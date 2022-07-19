import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Table } from './table.schema';
import { TableDto } from './table.dto';
import { GameplayService } from '../gameplay/gameplay.service';
import { CreateGameplayDto } from '../gameplay/dto/create-gameplay.dto';

@Injectable()
export class TableService {
  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    private readonly gameplayService: GameplayService,
  ) {}

  async create(tableDto: TableDto) {
    return this.tableModel.create(tableDto);
  }

  async update(_id: number, tableDto: TableDto) {
    return this.tableModel.findOneAndUpdate({ _id }, tableDto);
  }

  async findById(_id: number): Promise<Table | undefined> {
    return this.tableModel.findOne({ _id });
  }

  async getByLocation(location: number, date: string): Promise<Table[]> {
    return this.tableModel.find({ location, date }).populate('gameplays');
  }

  async addGameplay(id: number, gameplayDto: CreateGameplayDto) {
    const table = await this.tableModel.findById(id);

    if (!table) {
      throw new Error('Table not found');
    }

    const gameplay = await this.gameplayService.create(gameplayDto);

    table.gameplays.push(gameplay);
    await table.save();
  }
}
