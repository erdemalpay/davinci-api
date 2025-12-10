import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { format, subDays, addHours, addMinutes } from 'date-fns';
import { Table } from '../table/table.schema';
import { Order } from '../order/order.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { Game } from '../game/game.schema';
import { MenuItem } from '../menu/item.schema';
import { OrderStatus } from '../order/order.dto';

@Injectable()
export class SeedService {
  private logger: Logger = new Logger('SeedService');

  constructor(
    @InjectModel(Table.name) private tableModel: Model<Table>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
    @InjectModel(Location.name) private locationModel: Model<Location>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Game.name) private gameModel: Model<Game>,
    @InjectModel(MenuItem.name) private menuItemModel: Model<MenuItem>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async clearTestData(locationId: number = 2, date?: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Eğer date verilmemişse, bugünü kullan
      const today = format(new Date(), 'yyyy-MM-dd');
      const targetDate = date || today;

      const query: any = { location: locationId, date: targetDate };

      // Önce table ID'lerini al
      const tables = await this.tableModel.find(query).select('_id').session(session);
      const tableIdList = tables.map(t => t._id);

      // Sadece bu masalara ait orders sil
      const deletedOrders = await this.orderModel.deleteMany({
        location: locationId,
        table: { $in: tableIdList }
      }).session(session);

      // Sadece bu masalara ait gameplays sil
      const deletedGameplays = await this.gameplayModel.deleteMany({
        location: locationId,
        date: targetDate
      }).session(session);

      // En son tables sil
      const deletedTables = await this.tableModel.deleteMany(query).session(session);

      await session.commitTransaction();

      this.logger.log(
        `Cleared ${deletedTables.deletedCount} tables, ${deletedOrders.deletedCount} orders, ${deletedGameplays.deletedCount} gameplays`,
      );

      return {
        success: true,
        deletedTables: deletedTables.deletedCount,
        deletedOrders: deletedOrders.deletedCount,
        deletedGameplays: deletedGameplays.deletedCount,
      };
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Clear failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async seedTestData(locationId: number = 2) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Location'ı ve masa isimlerini al
      const location = await this.locationModel.findById(locationId);
      if (!location) {
        throw new Error(`Location ${locationId} not found`);
      }

      const tableNames = location.tableNames || [];
      if (tableNames.length === 0) {
        throw new Error(`Location ${locationId} has no table names`);
      }

      // 2. Users, menu items ve games al
      const users = await this.userModel.find({ location: locationId }).exec();
      const menuItems = await this.menuItemModel
        .find({ locations: locationId, shownInMenu: true })
        .exec();
      const games = await this.gameModel.find({ locations: locationId }).exec();

      if (users.length === 0) {
        throw new Error(`No users found for location ${locationId}`);
      }
      if (menuItems.length === 0) {
        throw new Error(`No menu items found for location ${locationId}`);
      }
      if (games.length === 0) {
        throw new Error(`No games found for location ${locationId}`);
      }

      this.logger.log(
        `Found ${tableNames.length} tables, ${users.length} users, ${menuItems.length} menu items, ${games.length} games`,
      );

      // 3. Test dataları oluştur
      const createdTables = [];
      const createdOrders = [];
      const createdGameplays = [];

      const targetTableCount = this.randomInt(60, 70);
      const today = new Date();

      // 24-27 açık masa, geri kalan kapalı
      const openTableCount = this.randomInt(24, 27);
      const closedTableCount = targetTableCount - openTableCount;

      // Açık masalar (sadece bugün)
      for (let i = 0; i < openTableCount; i++) {
        const tableName = tableNames[i % tableNames.length];
        const date = format(today, 'yyyy-MM-dd');
        const startHour = this.randomTime(10, 22);

        const table = await this.createTable(
          locationId,
          tableName,
          date,
          startHour,
          null,
          users,
        );
        createdTables.push(table);

        // Orders ekle
        const orders = await this.createOrdersForTable(
          table,
          menuItems,
          users,
          false,
        );
        createdOrders.push(...orders);

        // Gameplays ekle (70-80% ihtimalle)
        if (Math.random() < 0.75) {
          const gameplays = await this.createGameplaysForTable(
            table,
            games,
            users,
            false,
          );
          createdGameplays.push(...gameplays);
        }
      }

      // Kapalı masalar (bugün)
      for (let i = 0; i < closedTableCount; i++) {
        const tableName =
          tableNames[this.randomInt(0, tableNames.length - 1)];
        const date = format(today, 'yyyy-MM-dd');
        const startHour = this.randomTime(10, 22);
        const duration = this.randomInt(1, 4);
        const finishHour = format(
          addHours(
            new Date(`${date}T${startHour}`),
            duration,
          ),
          'HH:mm',
        );

        const table = await this.createTable(
          locationId,
          tableName,
          date,
          startHour,
          finishHour,
          users,
        );
        createdTables.push(table);

        // Orders ekle
        const orders = await this.createOrdersForTable(
          table,
          menuItems,
          users,
          true,
        );
        createdOrders.push(...orders);

        // Gameplays ekle
        if (Math.random() < 0.75) {
          const gameplays = await this.createGameplaysForTable(
            table,
            games,
            users,
            true,
          );
          createdGameplays.push(...gameplays);
        }
      }

      // Transaction'ı commit et
      await session.commitTransaction();

      this.logger.log(
        `Successfully seeded ${createdTables.length} tables, ${createdOrders.length} orders, ${createdGameplays.length} gameplays`,
      );

      return {
        success: true,
        createdTables: createdTables.length,
        createdOrders: createdOrders.length,
        createdGameplays: createdGameplays.length,
      };
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Seed failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async createTable(
    locationId: number,
    tableName: string,
    date: string,
    startHour: string,
    finishHour: string | null,
    users: User[],
  ) {
    const randomUser = users[this.randomInt(0, users.length - 1)];
    const playerCount = this.randomInt(1, 8);
    const type = Math.random() < 0.9 ? 'normal' : 'takeout';

    const table = await this.tableModel.create({
      location: locationId,
      name: tableName,
      date,
      startHour,
      finishHour,
      playerCount,
      type,
      status: finishHour ? 'closed' : null,
      gameplays: [],
      orders: [],
      isAutoEntryAdded: false,
      createdBy: randomUser._id,
    });

    return table;
  }

  private async createOrdersForTable(
    table: any,
    menuItems: MenuItem[],
    users: User[],
    isClosed: boolean,
  ) {
    const orderCount = this.randomInt(2, 10);
    const orders = [];
    const orderIds = [];

    for (let i = 0; i < orderCount; i++) {
      const randomItem = menuItems[this.randomInt(0, menuItems.length - 1)];
      const randomUser = users[this.randomInt(0, users.length - 1)];
      const quantity = this.randomInt(1, 5);

      let status: OrderStatus;
      if (isClosed) {
        status = OrderStatus.SERVED;
      } else {
        const rand = Math.random();
        if (rand < 0.33) {
          status = OrderStatus.PENDING;
        } else if (rand < 0.66) {
          status = OrderStatus.READYTOSERVE;
        } else {
          status = OrderStatus.SERVED;
        }
      }

      const createdAt = new Date(`${table.date}T${table.startHour}`);
      const randomMinutes = this.randomInt(5, 30);
      const orderCreatedAt = addMinutes(createdAt, randomMinutes * i);

      const order = await this.orderModel.create({
        location: table.location,
        item: randomItem._id,
        table: table._id,
        quantity,
        status,
        unitPrice: randomItem.price,
        paidQuantity: isClosed ? quantity : 0,
        createdAt: orderCreatedAt,
        createdBy: randomUser._id,
        tableDate: new Date(table.date),
        kitchen: 'bar',
      });

      orders.push(order);
      orderIds.push(order._id);
    }

    // Table'a order id'lerini ekle
    await this.tableModel.findByIdAndUpdate(table._id, {
      orders: orderIds,
    });

    return orders;
  }

  private async createGameplaysForTable(
    table: any,
    games: Game[],
    users: User[],
    isClosed: boolean,
  ) {
    const gameplayCount = this.randomInt(1, 3);
    const gameplays = [];
    const gameplayIds = [];

    for (let i = 0; i < gameplayCount; i++) {
      const randomGame = games[this.randomInt(0, games.length - 1)];
      const randomMentor = users[this.randomInt(0, users.length - 1)];
      const randomCreator = users[this.randomInt(0, users.length - 1)];

      const baseTime = new Date(`${table.date}T${table.startHour}`);
      const gameStartTime = addMinutes(baseTime, i * 30);
      const gameStartHour = format(gameStartTime, 'HH:mm');

      let finishHour = null;
      if (isClosed || (i < gameplayCount - 1)) {
        const gameDuration = this.randomInt(30, 90);
        finishHour = format(addMinutes(gameStartTime, gameDuration), 'HH:mm');
      }

      const gameplay = await this.gameplayModel.create({
        location: table.location,
        playerCount: table.playerCount,
        mentor: randomMentor._id,
        createdBy: randomCreator._id,
        date: table.date,
        startHour: gameStartHour,
        finishHour,
        game: randomGame._id,
      });

      gameplays.push(gameplay);
      gameplayIds.push(gameplay._id);
    }

    // Table'a gameplay id'lerini ekle
    await this.tableModel.findByIdAndUpdate(table._id, {
      gameplays: gameplayIds,
    });

    return gameplays;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomTime(minHour: number, maxHour: number): string {
    const hour = this.randomInt(minHour, maxHour);
    const minute = this.randomInt(0, 59);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
}
