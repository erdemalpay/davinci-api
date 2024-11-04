import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { DailyPlayerCount } from 'src/types';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { GameplayService } from '../gameplay/gameplay.service';
import { OrderService } from '../order/order.service';
import { User } from '../user/user.schema';
import { MenuService } from './../menu/menu.service';
import { OrderStatus } from './../order/order.dto';
import { PanelControlService } from './../panelControl/panelControl.service';
import { TableDto } from './table.dto';
import { TableGateway } from './table.gateway';
import { Table } from './table.schema';

@Injectable()
export class TableService {
  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    private readonly gameplayService: GameplayService,
    private readonly activityService: ActivityService,
    private readonly menuService: MenuService,
    private readonly tableGateway: TableGateway,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly panelControlService: PanelControlService,
  ) {}

  async create(user: User, tableDto: TableDto) {
    const createdTable = await this.tableModel.create(tableDto);
    this.activityService.addActivity(
      user,
      ActivityType.CREATE_TABLE,
      createdTable,
    );
    // Add auto entry for the table
    if (
      tableDto.isAutoEntryAdded &&
      !tableDto?.isOnlineSale &&
      tableDto.playerCount > 0
    ) {
      const isWeekend = await this.panelControlService.isWeekend();
      const menuItem = await this.menuService.findItemById(isWeekend ? 5 : 113);
      await this.orderService.createOrder(user, {
        table: createdTable._id,
        location: createdTable.location,
        item: menuItem._id,
        quantity: tableDto.playerCount,
        createdAt: new Date(tableDto.date),
        createdBy: user._id,
        status: OrderStatus.AUTOSERVED,
        paidQuantity: 0,
        unitPrice: menuItem.price,
        kitchen: 'bar',
      });
    }
    this.tableGateway.emitTableChanged(user, createdTable);
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
    this.tableGateway.emitTableChanged(user, updatedTable);
    return updatedTable;
  }
  async updateTableOrders(user: User, id: number, order: number) {
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
    this.tableGateway.emitTableChanged(user, updatedTable);
    return updatedTable;
  }
  async close(user: User, id: number, tableDto: TableDto) {
    const table = await this.tableModel.findById(id);
    // Close the previous gameplay
    if (table.gameplays.length) {
      const lastGameplayId = table.gameplays[table.gameplays.length - 1];
      const lastGameplay = await this.gameplayService.findById(
        lastGameplayId as unknown as number,
      );
      if (!lastGameplay?.finishHour) {
        await this.gameplayService.close(
          user,
          lastGameplayId as unknown as number,
          tableDto.finishHour,
        );
      }
    }
    const updatedTable = await this.tableModel.findByIdAndUpdate(
      id,
      {
        finishHour: tableDto.finishHour,
      },
      { new: true },
    );
    this.tableGateway.emitTableChanged(user, updatedTable);
    return updatedTable;
  }

  async reopen(user: User, id: number) {
    const updatedTable = await this.tableModel.findByIdAndUpdate(
      id,
      { $unset: { finishHour: '' } },
      { new: true },
    );
    this.tableGateway.emitTableChanged(user, updatedTable);
    return updatedTable;
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
    return this.tableModel.find({ date: date, location: location });
  }
  async findByDateAndLocation(
    date: string,
    location: number,
  ): Promise<Table[]> {
    return this.tableModel.find({ date: date, location: location });
  }

  async getByLocation(location: number, date: string): Promise<Table[]> {
    return this.tableModel
      .find({ location, date })
      .populate({
        path: 'gameplays',
        populate: {
          path: 'mentor',
        },
      })
      .exec();
  }
  async getYerVarmiByLocation(location: number, date: string) {
    console.log('here');
    try {
      const tables = await this.tableModel.find({
        location,
        date,
        finishHour: { $exists: false },
        isOnlineSale: { $ne: true },
      });
      console.log(tables.length);
      return tables.length;
    } catch (error) {
      console.error('Error retrieving tables:', error);
      throw new Error('Failed to retrieve table availability.');
    }
  }

  async addGameplay(user: User, id: number, gameplayDto: GameplayDto) {
    const table = await this.tableModel.findById(id);

    if (!table) {
      throw new Error('Table not found');
    }
    // Close the previous gameplay
    if (table.gameplays.length) {
      const lastGameplayId = table.gameplays[table.gameplays.length - 1];
      const lastGameplay = await this.gameplayService.findById(
        lastGameplayId as unknown as number,
      );
      if (!lastGameplay?.finishHour) {
        await this.gameplayService.close(
          user,
          lastGameplayId as unknown as number,
          gameplayDto.startHour,
        );
      }
    }
    const gameplay = await this.gameplayService.create(user, gameplayDto);
    this.activityService.addActivity(user, ActivityType.CREATE_GAMEPLAY, {
      tableId: id,
      gameplay,
    });

    table.gameplays.push(gameplay);
    await table.save();
    this.tableGateway.emitTableChanged(user, table);
    return table;
  }

  async removeGameplay(user: User, tableId: number, gameplayId: number) {
    const table = await this.tableModel.findById(tableId);

    if (!table) {
      throw new Error('Table not found');
    }
    const gameplay = await this.gameplayService.findById(gameplayId);
    await this.gameplayService.remove(user, gameplayId);

    this.activityService.addActivity(
      user,
      ActivityType.DELETE_GAMEPLAY,
      gameplay,
    );

    table.gameplays = table.gameplays.filter(
      (gameplay) => gameplay._id !== gameplayId,
    );
    await table.save();
    this.tableGateway.emitTableChanged(user, table);
    return table;
  }

  async removeTableAndGameplays(user: User, id: number) {
    const table = await this.tableModel.findById(id).exec();
    if (!table) {
      throw new Error(`Table ${id} does not exist.`);
    }
    const isTableHasOrders = (table?.orders as any)?.some(
      (order) => order.status !== OrderStatus.CANCELLED,
    );
    if (isTableHasOrders) {
      throw new HttpException(
        'Table has orders. Please cancel the orders first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.activityService.addActivity(user, ActivityType.DELETE_TABLE, table);
    await Promise.all(
      table.gameplays.map((gameplay) =>
        this.gameplayService.remove(user, gameplay._id),
      ),
    );
    await this.tableModel.findByIdAndRemove(id);
    this.tableGateway.emitTableChanged(user, table);

    return table;
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
  getTableById(id: number) {
    return this.tableModel.findById(id);
  }
  async removeTable(user: User, id: number) {
    const table = await this.tableModel.findByIdAndRemove(id);
    this.tableGateway.emitTableChanged(user, table);
    return table;
  }
}
