import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare } from 'bcrypt';
import { Model } from 'mongoose';
import { cafeToday } from 'src/utils/cafeTime';
import { isMongoDuplicateKey } from 'src/utils/mongoErrors';
import { Consumer, ConsumerStatus } from '../consumer/consumer.schema';
import {
  ConsumerService,
  DEFAULT_CONSUMER_PASSWORD,
} from '../consumer/consumer.service';
import { Gameplay } from '../gameplay/gameplay.schema';
import { TableStatus } from '../table/table.dto';
import { Table } from '../table/table.schema';
import { TableService } from '../table/table.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CheckInDto,
  LoginConsumerDto,
  RegisterConsumerDto,
  SaveGameplayResultDto,
} from './consumerApp.dto';
import { GameplayResult, TableCheckIn } from './consumerApp.schema';
import { computeConsumerStats, StatsResult } from './consumerStats';
import {
  CONSUMER_TOKEN_EXPIRES_IN,
  CONSUMER_TOKEN_TYPE,
  ConsumerTokenPayload,
} from './consumerToken';

const RESULTS_LIMIT = 100;
const CHECK_IN_CONSUMER_FIELDS = 'fullName userName profileImage';

const isOpen = (table: Table | null) =>
  !!table && !table.finishHour && table.status !== TableStatus.CANCELLED;

@Injectable()
export class ConsumerAppService {
  constructor(
    @InjectModel(TableCheckIn.name)
    private checkInModel: Model<TableCheckIn>,
    @InjectModel(GameplayResult.name)
    private resultModel: Model<GameplayResult>,
    private readonly consumerService: ConsumerService,
    private readonly tableService: TableService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  private session(consumer: Consumer) {
    const payload: ConsumerTokenPayload = {
      type: CONSUMER_TOKEN_TYPE,
      consumer: consumer._id,
    };
    return {
      token: this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: CONSUMER_TOKEN_EXPIRES_IN,
      }),
      consumer,
    };
  }

  async register(dto: RegisterConsumerDto) {
    const consumer = await this.consumerService.create({
      name: dto.name.trim(),
      surname: dto.surname.trim(),
      userName: dto.userName.trim(),
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      phone: dto.phone,
    });
    return this.session(consumer);
  }

  async login(dto: LoginConsumerDto) {
    const consumer = await this.consumerService.findByEmailOrUserName(
      dto.identity.trim(),
    );
    // Consumers added from the panel without a password have the default
    // one; it must not open their account.
    const canLogIn =
      consumer?.status === ConsumerStatus.ACTIVE &&
      !!consumer.password &&
      (await compare(dto.password, consumer.password)) &&
      !(await compare(DEFAULT_CONSUMER_PASSWORD, consumer.password));
    if (!canLogIn) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.session(consumer);
  }

  async checkIn(consumer: Consumer, dto: CheckInDto) {
    const table = await this.tableService.findOpenByName(
      dto.location,
      dto.tableName,
    );
    if (!table) {
      throw new NotFoundException('The table is not open');
    }
    const filter = { consumer: consumer._id, table: table._id };
    if (!(await this.checkInModel.exists(filter))) {
      try {
        await this.checkInModel.create({
          ...filter,
          location: table.location,
          tableName: dto.tableName,
          date: table.date,
        });
      } catch (error) {
        // Scanned twice at once: the other request saved it.
        if (!isMongoDuplicateKey(error)) throw error;
      }
      this.websocketGateway.emitConsumerTableChanged(
        await this.consumersAt(table._id),
      );
    }
    return this.myTable(consumer);
  }

  private async consumersAt(tableId: number) {
    const checkIns = await this.checkInModel
      .find({ table: tableId })
      .select('consumer')
      .lean();
    return checkIns.map((checkIn) => checkIn.consumer);
  }

  // The open table the consumer checked in at today, with who sits there,
  // the games played and their results.
  async myTable(consumer: Consumer) {
    const checkIn = await this.checkInModel
      .findOne({ consumer: consumer._id, date: cafeToday() })
      .sort({ createdAt: -1 });
    if (!checkIn) return null;
    const table = await this.tableService.findByIdWithGameplays(checkIn.table);
    if (!isOpen(table)) return null;

    const [players, results] = await Promise.all([
      this.checkInModel
        .find({ table: table._id })
        .populate('consumer', CHECK_IN_CONSUMER_FIELDS)
        .lean(),
      this.resultModel
        .find({
          gameplay: { $in: table.gameplays.map((gameplay) => gameplay._id) },
        })
        .lean(),
    ]);
    return {
      table: {
        _id: table._id,
        name: checkIn.tableName,
        location: table.location,
        date: table.date,
        startHour: table.startHour,
      },
      players: players.map((player) => player.consumer),
      gameplays: table.gameplays.map((gameplay: Gameplay) => ({
        _id: gameplay._id,
        game: gameplay.game,
        startHour: gameplay.startHour,
        finishHour: gameplay.finishHour,
        playerCount: gameplay.playerCount,
        result: results.find((result) => result.gameplay === gameplay._id),
      })),
    };
  }

  async saveResult(consumer: Consumer, dto: SaveGameplayResultDto) {
    const found = await this.tableService.findByGameplay(dto.gameplay);
    const table =
      found && (await this.tableService.findByIdWithGameplays(found._id));
    const gameplay = table?.gameplays.find(
      (item: Gameplay) => item._id === dto.gameplay,
    );
    if (!table || !gameplay) {
      throw new NotFoundException('Gameplay not found');
    }
    const tableConsumers = await this.consumersAt(table._id);
    if (!tableConsumers.includes(consumer._id)) {
      throw new ForbiddenException('You did not check in at this table');
    }
    const playerConsumers = dto.players
      .map((player) => player.consumer)
      .filter((id): id is number => id !== undefined);
    if (!playerConsumers.includes(consumer._id)) {
      throw new HttpException(
        'You must be one of the players',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (new Set(playerConsumers).size !== playerConsumers.length) {
      throw new HttpException(
        'A player is listed twice',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (playerConsumers.some((id) => !tableConsumers.includes(id))) {
      throw new HttpException(
        'Players must have checked in at this table',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.resultModel.findOne({ gameplay: dto.gameplay });
    if (
      existing &&
      !existing.players.some((player) => player.consumer === consumer._id)
    ) {
      throw new ForbiddenException('Only its players can change a result');
    }

    // App users are listed with their own names.
    const names = new Map(
      (
        await this.checkInModel
          .find({ table: table._id, consumer: { $in: playerConsumers } })
          .populate<{ consumer: Consumer }>('consumer', 'fullName')
          .lean()
      ).map((checkIn) => [checkIn.consumer._id, checkIn.consumer.fullName]),
    );
    const players = dto.players.map((player) => ({
      consumer: player.consumer,
      name:
        (player.consumer && names.get(player.consumer)) || player.name.trim(),
      score: player.score,
      isWinner: player.isWinner,
    }));

    let result: GameplayResult;
    if (existing) {
      existing.players = players;
      result = await existing.save();
    } else {
      result = await this.resultModel.create({
        gameplay: dto.gameplay,
        game: gameplay.game._id,
        table: table._id,
        location: table.location,
        date: table.date,
        players,
        createdBy: consumer._id,
      });
    }

    const notified = new Set([
      ...tableConsumers,
      ...(existing?.players ?? []).map((player) => player.consumer),
    ]);
    this.websocketGateway.emitGameplayResultChanged(
      [...notified].filter((id): id is number => id !== undefined),
    );
    return result;
  }

  async myResults(consumer: Consumer) {
    return this.resultModel
      .find({ 'players.consumer': consumer._id })
      .sort({ date: -1, _id: -1 })
      .limit(RESULTS_LIMIT)
      .populate('game', 'name thumbnail')
      .lean();
  }

  async stats(consumer: Consumer) {
    const results = await this.resultModel
      .find({ 'players.consumer': consumer._id })
      .select('game players')
      .populate('game', 'name thumbnail')
      .lean<StatsResult[]>();
    return computeConsumerStats(consumer._id, results);
  }
}
