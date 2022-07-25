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
    return this.tableModel.findOneAndUpdate({ _id }, tableDto, { new: true });
  }

  async findById(_id: number): Promise<Table | undefined> {
    return this.tableModel.findOne({ _id });
  }

  async findByQuery(query: Partial<TableDto>): Promise<Table | undefined> {
    return this.tableModel.findOne(query);
  }

  async getByLocation(location: number, date: string): Promise<Table[]> {
    return this.tableModel.find({ location, date }).populate({
      path: 'gameplays',
      populate: {
        path: 'mentor',
      },
    });
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

  async removeGameplay(tableId: number, gameplayId: number) {
    const table = await this.tableModel.findById(tableId);

    if (!table) {
      throw new Error('Table not found');
    }

    await this.gameplayService.remove(gameplayId);

    table.gameplays = table.gameplays.filter(
      (gameplay) => gameplay._id !== gameplayId,
    );
    await table.save();
  }

  async removeTableAndGameplays(id: number) {
    const table = await this.tableModel.findById(id);
    await Promise.all(
      table.gameplays.map((gameplay) =>
        this.gameplayService.remove(gameplay._id),
      ),
    );

    return this.tableModel.findByIdAndRemove(id);
  }
}
