import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addDays, format, subDays } from 'date-fns';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import { DailyPlayerCount } from 'src/types';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { GameplayService } from '../gameplay/gameplay.service';
import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { OrderService } from '../order/order.service';
import { ReservationService } from '../reservation/reservation.service';
import { User } from '../user/user.schema';
import { MenuService } from './../menu/menu.service';
import { CreateOrderDto, OrderStatus } from './../order/order.dto';
import { PanelControlService } from './../panelControl/panelControl.service';
import { ReservationStatusEnum } from '../reservation/reservation.schema';
import { Feedback } from './feedback.schema';
import {
  CreateFeedbackDto,
  TableDto,
  TableStatus,
  TableTypes,
} from './table.dto';
import { TableGateway } from './table.gateway';
import { Table } from './table.schema';

@Injectable()
export class TableService {
  private logger: Logger = new Logger('TableService');

  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    @InjectModel(Feedback.name) private feedbackModel: Model<Feedback>,
    private readonly gameplayService: GameplayService,
    private readonly activityService: ActivityService,
    private readonly reservationService: ReservationService,
    private readonly menuService: MenuService,
    private readonly tableGateway: TableGateway,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly panelControlService: PanelControlService,
    private readonly notificationService: NotificationService,
    private readonly i18n: I18nService,
  ) {}

  async create(user: User, tableDto: TableDto, orders?: CreateOrderDto[]) {
    const foundTable = await this.tableModel.findOne({
      location: tableDto.location,
      date: tableDto.date,
      status: { $ne: TableStatus.CANCELLED },
      finishHour: { $exists: false },
      $or: [{ name: tableDto.name }, { tables: { $in: [tableDto.name] } }],
    });
    if (foundTable && foundTable.type !== TableTypes.TAKEOUT) {
      throw new HttpException(
        'Table with the same name already exists for the given date and location',
        HttpStatus.BAD_REQUEST,
      );
    }

    const createdTable = await this.tableModel.create({
      ...tableDto,
      createdBy: user._id,
    });
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
        tableDate: new Date(tableDto.date),
      });
    }
    if (createdTable.type === TableTypes.TAKEOUT) {
      if (orders) {
        await this.orderService.createMultipleOrder(user, orders, createdTable);
      }
    } else {
      this.tableGateway.emitTableChanged(user, createdTable);
    }
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
  async findOnlineTables() {
    const tables = await this.tableModel.find({
      isOnlineSale: true,
      status: { $ne: TableStatus.CANCELLED },
    });
    return tables;
  }
  async updateTableOrders(user: User, id: number, order: number | number[]) {
    const existingTable = await this.tableModel.findById(id);
    if (!existingTable) {
      throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
    }

    try {
      const update = Array.isArray(order)
        ? { $addToSet: { orders: { $each: order } } }
        : { $addToSet: { orders: order } };

      const updatedTable = await this.tableModel.findByIdAndUpdate(id, update, {
        new: true,
      });

      if (!updatedTable) {
        throw new HttpException(
          'Update failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.tableGateway.emitTableChanged(user, updatedTable);
      return updatedTable;
    } catch (error) {
      console.error('Failed to update table orders:', error.message);
      throw new HttpException(
        'Failed to update table orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async close(user: User, id: number, tableDto: TableDto) {
    const table = await this.tableModel.findById(id);

    // Validate all orders are paid before closing
    const orders = await this.orderService.findGivenTableOrders(id);

    // Filter out cancelled orders
    const activeOrders = orders.filter(
      (order) => order.status !== OrderStatus.CANCELLED,
    );

    // Check if all items are marked as paid
    const allItemsPaid = activeOrders.every(
      (order) => order.paidQuantity === order.quantity,
    );

    // Validation: Cannot close table with unpaid orders
    if (!allItemsPaid) {
      throw new HttpException(
        'Cannot close table with unpaid orders',
        HttpStatus.BAD_REQUEST,
      );
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

    this.tableGateway.emitSingleTableChanged(user, updatedTable);
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
    return this.tableModel.find({
      date: date,
      location: location,
    });
  }

  async getByLocation(location: number, date: string): Promise<Table[]> {
    if (!date || !location) {
      throw new HttpException(
        'Date and location are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tableModel
      .find({ location, date, status: { $ne: TableStatus.CANCELLED } })
      .populate({
        path: 'gameplays',
        populate: {
          path: 'mentor',
          select: '-password',
        },
      })
      .exec();
  }
  async getYerVarmiByLocation(location: number, date: string) {
    try {
      const tables = await this.tableModel.find({
        location,
        date,
        finishHour: { $exists: false },
        isOnlineSale: { $ne: true },
        status: { $ne: TableStatus.CANCELLED },
      });
      const comingReservations = await this.reservationService.find({
        location,
        date,
        status: ReservationStatusEnum.COMING,
      });
      const waitingReservations = await this.reservationService.find({
        location,
        date,
        status: ReservationStatusEnum.WAITING,
      });
      return (
        tables.filter(
          (table) => !table?.finishHour && table.type === TableTypes.NORMAL,
        ).length +
        tables
          .filter(
            (table) => !table?.finishHour && table.type === TableTypes.ACTIVITY,
          )
          .reduce((prev, curr) => {
            return Number(prev) + Number(curr.tables?.length);
          }, 0) +
        comingReservations.length +
        waitingReservations.length
      );
    } catch (error) {
      console.error('Error retrieving tables:', error);
      throw new HttpException(
        'Failed to retrieve table availability.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async addGameplay(user: User, id: number, gameplayDto: GameplayDto) {
    const table = await this.tableModel.findById(id);

    if (!table) {
      throw new HttpException('Table not found', HttpStatus.NOT_FOUND);
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
      throw new HttpException('Table not found', HttpStatus.NOT_FOUND);
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
      throw new HttpException(
        `Table ${id} does not exist.`,
        HttpStatus.NOT_FOUND,
      );
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
  async getAfterGivenDateCreatedNumbers(after: string, before?: string) {
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          date: {
            $gte: after,
            $lte:
              before !== '' && before !== undefined && before !== null
                ? format(addDays(new Date(before), 1), 'yyyy-MM-dd')
                : format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          },
          status: { $ne: TableStatus.CANCELLED },
        },
      },
      {
        $group: {
          _id: '$createdBy',
          tableCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          createdBy: '$_id',
          tableCount: 1,
        },
      },
    ];

    const results = await this.tableModel.aggregate(aggregationPipeline).exec();
    return results;
  }

  async getTotalPlayerCountsByMonthAndYear(
    month: string,
    year: string,
  ): Promise<DailyPlayerCount[]> {
    const paddedMonth = month.padStart(2, '0');
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDayOfMonth = new Date(
      parseInt(year),
      parseInt(month),
      0,
    ).getDate();
    const endDate = `${year}-${paddedMonth}-${lastDayOfMonth
      .toString()
      .padStart(2, '0')}`;
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          date: {
            $gte: startDate,
            $lte: endDate,
          },
          status: { $ne: TableStatus.CANCELLED },
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
              k: { $toString: '$_id.location' },
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
  async notifyUnclosedTables() {
    function formatDate(date: Date): string {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    function getTurkishDateOffset(): Date {
      const nowUTC = new Date();
      const offsetInMs = 3 * 60 * 60 * 1000; // GMT+3 => 3 saat ileri
      return new Date(nowUTC.getTime() + offsetInMs);
    }

    const todayTR = getTurkishDateOffset();
    const yesterdayTR = subDays(todayTR, 1);

    const todayStr = formatDate(todayTR);
    const yesterdayStr = formatDate(yesterdayTR);

    const unclosedTables = await this.tableModel.find({
      date: { $in: [todayStr, yesterdayStr] },
      status: { $ne: TableStatus.CANCELLED },
      $or: [
        { finishHour: { $exists: false } },
        { finishHour: null },
        { finishHour: '' },
      ],
    });

    if (unclosedTables.length > 0) {
      const translationArgs = {
        args: {
          count: unclosedTables.length,
          beVerb: unclosedTables.length === 1 ? 'is' : 'are',
          tableWord: unclosedTables.length === 1 ? 'table' : 'tables',
        },
      };
      const [
        notificationMessage,
        notificationMessageEn,
        notificationMessageTr,
      ] = await Promise.all([
        this.i18n.t('UnclosedTablesToday', translationArgs) as Promise<string>,
        this.i18n.t('UnclosedTablesToday', {
          ...translationArgs,
          lang: 'en',
        }) as Promise<string>,
        this.i18n.t('UnclosedTablesToday', {
          ...translationArgs,
          lang: 'tr',
        }) as Promise<string>,
      ]);
      await this.notificationService.createNotification({
        type: NotificationType.WARNING,
        selectedUsers: [],
        selectedRoles: [1],
        selectedLocations: [2],
        seenBy: [],
        event: NotificationEventType.NIGHTOPENTABLE,
        message: notificationMessage,
        messageEn: notificationMessageEn,
        messageTr: notificationMessageTr,
      });
    } else {
      this.logger.log('No unclosed tables found');
    }
  }
  //feedback
  async findQueryFeedback(after?: string, before?: string, location?: number) {
    const query: any = {};
    const createdAt: Record<string, Date> = {};
    if (after) {
      createdAt.$gte = new Date(after);
    }
    if (before) {
      const [y, m, d] = before.split('-').map(Number);
      const endOfDayLocal = new Date(y, m - 1, d, 23, 59, 59, 999);
      createdAt.$lte = endOfDayLocal;
    }
    if (Object.keys(createdAt).length) {
      query.createdAt = createdAt;
    }
    if (location) {
      query.location = Number(location);
    }
    return this.feedbackModel.find(query);
  }

  async createFeedback(data: CreateFeedbackDto) {
    const existingTable = await this.tableModel.findOne({
      location: data.location,
      name: data.tableName,
      date: format(new Date(), 'yyyy-MM-dd'),
      finishHour: { $exists: false },
    });

    const feedback = new this.feedbackModel({
      ...data,
      ...(existingTable && { table: existingTable._id }),
    });
    await feedback.save();
    this.tableGateway.emitFeedbackChanged(feedback);
    return feedback;
  }

  async updateFeedback(id: number, updates: UpdateQuery<Feedback>) {
    const updatedFeedback = await this.feedbackModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    if (!updatedFeedback) {
      throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
    }
    this.tableGateway.emitFeedbackChanged(updatedFeedback);
    return updatedFeedback;
  }

  async removeFeedback(id: number) {
    const feedback = await this.feedbackModel.findByIdAndRemove(id);
    if (!feedback) {
      throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
    }
    this.tableGateway.emitFeedbackChanged(feedback);
    return feedback;
  }
}
