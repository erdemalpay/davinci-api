import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { GameplayService } from '../gameplay/gameplay.service';
import { User } from '../user/user.schema';
import { CloseAllDto, TableDto } from './table.dto';
import { Table } from './table.schema';

@Injectable()
export class TableService {
  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    private readonly gameplayService: GameplayService,
    private readonly activityService: ActivityService,
  ) {}

  async create(user: User, tableDto: TableDto) {
    const createdTable = await this.tableModel.create(tableDto);
    this.activityService.addActivity(
      user,
      ActivityType.CREATE_TABLE,
      createdTable,
    );
    return createdTable;
  }

  async update(user: User, id: number, tableDto: TableDto) {
    const existingTable = await this.tableModel.findById(id);
    const updatedTable = await this.tableModel.findByIdAndUpdate(id, tableDto, {
      new: true,
    });
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_TABLE,
      existingTable,
      updatedTable,
    );
    return updatedTable;
  }

  async close(id: number, tableDto: TableDto) {
    const table = await this.tableModel.findById(id);
    // Close the previous gameplay
    if (table.gameplays.length) {
      const lastGameplay = table.gameplays[table.gameplays.length - 1];
      await this.gameplayService.close(
        lastGameplay as unknown as number,
        tableDto.finishHour,
      );
    }
    return this.tableModel.findByIdAndUpdate(
      id,
      {
        finishHour: tableDto.finishHour,
      },
      { new: true },
    );
  }
  async closeAll(closeAllDto: CloseAllDto) {
    const tables = await this.tableModel.find({
      _id: { $in: closeAllDto.ids },
    });

    const updatePromises = tables.map(async (table) => {
      if (table.gameplays.length) {
        const lastGameplay = table.gameplays[table.gameplays.length - 1];
        await this.gameplayService.close(
          lastGameplay as unknown as number,
          closeAllDto.finishHour,
        );
      }
      return this.tableModel.findByIdAndUpdate(
        table._id,
        { $set: { finishHour: closeAllDto.finishHour } },
        { new: true },
      );
    });

    return Promise.all(updatePromises);
  }

  async reopen(id: number) {
    return this.tableModel.findByIdAndUpdate(
      id,
      { $unset: { finishHour: '' } },
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

  async addGameplay(user: User, id: number, gameplayDto: GameplayDto) {
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
    this.activityService.addActivity(user, ActivityType.CREATE_GAMEPLAY, {
      tableId: id,
      gameplay,
    });

    table.gameplays.push(gameplay);
    await table.save();
  }

  async removeGameplay(user: User, tableId: number, gameplayId: number) {
    const table = await this.tableModel.findById(tableId);

    if (!table) {
      throw new Error('Table not found');
    }
    const gameplay = await this.gameplayService.findById(gameplayId);
    await this.gameplayService.remove(gameplayId);

    this.activityService.addActivity(
      user,
      ActivityType.DELETE_GAMEPLAY,
      gameplay,
    );

    table.gameplays = table.gameplays.filter(
      (gameplay) => gameplay._id !== gameplayId,
    );
    await table.save();
  }

  async removeTableAndGameplays(user: User, id: number) {
    const table = await this.tableModel.findById(id);
    if (!table) {
      throw new Error(`Table ${id} does not exist.`);
    }
    this.activityService.addActivity(user, ActivityType.DELETE_TABLE, table);
    await Promise.all(
      table.gameplays.map((gameplay) =>
        this.gameplayService.remove(gameplay._id),
      ),
    );

    return this.tableModel.findByIdAndRemove(id);
  }
}
