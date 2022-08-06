import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Table } from './table.schema';
import { TableDto } from './table.dto';
import { GameplayService } from '../gameplay/gameplay.service';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { format } from 'date-fns';

@Injectable()
export class TableService {
  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    private readonly gameplayService: GameplayService,
  ) {}

  async create(tableDto: TableDto) {
    return this.tableModel.create(tableDto);
  }

  async update(id: number, tableDto: TableDto) {
    return this.tableModel.findByIdAndUpdate(id, tableDto, { new: true });
  }

  async close(id: number, finishHour: string) {
    const table = await this.tableModel.findById(id);
    // Close the previous gameplay
    if (table.gameplays.length) {
      const lastGameplay = table.gameplays[table.gameplays.length - 1];
      await this.gameplayService.close(
        lastGameplay as unknown as number,
        finishHour,
      );
    }
    return this.tableModel.findByIdAndUpdate(
      id,
      {
        finishHour,
      },
      { new: true },
    );
  }

  async findById(id: number): Promise<Table | undefined> {
    return this.tableModel.findById(id);
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

  async addGameplay(id: number, gameplayDto: GameplayDto) {
    const table = await this.tableModel.findById(id);

    if (!table) {
      throw new Error('Table not found');
    }
    // Close the previous gameplay
    if (table.gameplays.length) {
      const lastGameplay = table.gameplays[table.gameplays.length - 1];
      await this.gameplayService.close(
        lastGameplay as unknown as number,
        gameplayDto.startHour,
      );
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
    if (!table) {
      throw new Error(`Table ${id} does not exist.`);
    }
    await Promise.all(
      table.gameplays.map((gameplay) =>
        this.gameplayService.remove(gameplay._id),
      ),
    );

    return this.tableModel.findByIdAndRemove(id);
  }
}
