import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { DailyPlayerCount } from 'src/types';
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
  async updateTableOrders(id: number, order: number) {
    const existingTable = await this.tableModel.findById(id);
    if (!existingTable) {
      throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
    }

    let updatedTable;
    try {
      updatedTable = await this.tableModel.findByIdAndUpdate(
        id,
        { $push: { orders: order } },
        { new: true },
      );
    } catch (error) {
      throw new HttpException(
        'Failed to update table orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!updatedTable) {
      throw new HttpException(
        'Table not found after update',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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

  async findByDateAndLocationWithOrderData(
    date: string,
    location: number,
  ): Promise<Table[]> {
    return this.tableModel
      .find({ date: date, location: location })
      .populate({
        path: 'orders',
        populate: [
          { path: 'table', model: 'Table' },
          { path: 'item', model: 'MenuItem' },
          { path: 'discount', model: 'Discount' },
          { path: 'location', model: 'Location' },
          {
            path: 'createdBy preparedBy deliveredBy cancelledBy',
            select: '-password',
          },
        ],
      })
      .exec();
  }
  async findByDateAndLocation(
    date: string,
    location: number,
  ): Promise<Table[]> {
    return this.tableModel.find({ date: date, location: location });
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
  async getTotalPlayerCountsByMonthAndYear(
    month: string,
    year: string,
  ): Promise<DailyPlayerCount[]> {
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${new Date(
      parseInt(year),
      parseInt(month) - 1,
      0,
    ).getDate()}`;

    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { date: '$date', location: '$location' },
          totalPlayerCount: { $sum: '$playerCount' },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          counts: {
            $push: {
              k: {
                $concat: [
                  'totalPlayerCountLocation',
                  { $toString: '$_id.location' },
                ],
              },
              v: '$totalPlayerCount',
            },
          },
        },
      },
      {
        $addFields: {
          countsByLocation: { $arrayToObject: '$counts' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          countsByLocation: 1,
        },
      },
      {
        $sort: { date: 1 },
      },
    ];

    const results = await this.tableModel.aggregate(aggregationPipeline).exec();

    // this is for sorting the locations inside the countsByLocation
    const sortedResults = results.map((result) => {
      const sortedCountsByLocationKeys = Object.keys(result.countsByLocation)
        .sort()
        .reduce((sortedObj, key) => {
          sortedObj[key] = result.countsByLocation[key];
          return sortedObj;
        }, {});

      return {
        ...result,
        countsByLocation: sortedCountsByLocationKeys,
      };
    });

    return sortedResults;
  }
}
