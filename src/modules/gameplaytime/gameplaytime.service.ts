import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameplayService } from '../gameplay/gameplay.service';
import { LocationService } from '../location/location.service';
import { TableService } from '../table/table.service';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateGameplayTimeDto,
  GameplayTimeQueryDto,
  UpdateGameplayTimeDto,
} from './gameplaytime.dto';
import { GameplayTime } from './gameplaytime.schema';

@Injectable()
export class GameplayTimeService {
  constructor(
    @InjectModel(GameplayTime.name)
    private gameplayTimeModel: Model<GameplayTime>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
    private readonly gameplayService: GameplayService,
    @Inject(forwardRef(() => TableService))
    private readonly tableService: TableService,
  ) {}

  async create(
    createGameplayTimeDto: CreateGameplayTimeDto,
  ): Promise<GameplayTime> {
    try {
      // Check if there's already an active gameplay time for the same user, date, and location
      const existingActiveGameplayTime = await this.gameplayTimeModel.findOne({
        user: createGameplayTimeDto.user,
        date: createGameplayTimeDto.date,
        location: createGameplayTimeDto.location,
        finishHour: { $exists: false },
      });

      if (existingActiveGameplayTime) {
        throw new HttpException(
          'User already has an active gameplay time for this date and location',
          HttpStatus.CONFLICT,
        );
      }

      const gameplayTimeRecord = await this.gameplayTimeModel.create(
        createGameplayTimeDto,
      );
      this.websocketGateway.emitGameplayTimeChanged();
      return gameplayTimeRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create gameplay time record',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async findAll(query: GameplayTimeQueryDto) {
    const {
      user,
      location,
      gameplay,
      date,
      after,
      before,
      page = 1,
      limit = 10,
      sort,
      asc = -1,
    } = query;

    const filter: Record<string, unknown> = {};

    if (user) filter.user = user;
    if (location) filter.location = location;
    if (gameplay) filter.gameplay = gameplay;
    if (date) filter.createdAt = date;

    const rangeFilter: Record<string, Date> = {};
    if (after) {
      const start = this.parseLocalDate(after);
      rangeFilter.$gte = start;
    }
    if (before) {
      const end = this.parseLocalDate(before);
      end.setHours(23, 59, 59, 999);
      rangeFilter.$lte = end;
    }
    if (Object.keys(rangeFilter).length) {
      filter.createdAt = rangeFilter;
    }

    const sortObject: Record<string, 1 | -1> = {};
    if (sort && sort !== '') {
      const dir = (typeof asc === 'string' ? Number(asc) : asc) === 1 ? 1 : -1;
      if (sort === 'date') {
        sortObject['createdAt'] = dir;
      } else {
        sortObject[sort] = dir;
      }
    } else {
      sortObject.createdAt = -1;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    if (query.search && String(query.search).trim().length > 0) {
      const rx = new RegExp(String(query.search).trim(), 'i');
      const numeric = Number(query.search);
      const isNumeric = !Number.isNaN(numeric);
      const [
        searchedLocationIds,
        searchedUserIds,
        searchedGameplayIds,
        searchedTableIds,
      ] = await Promise.all([
        this.locationService.searchLocationIds(query.search),
        this.userService.searchUserIds(query.search),
        this.gameplayService.searchGameplayIds(query.search),
        this.tableService.searchTableIds(query.search),
      ]);
      const orConds: any[] = [
        { date: { $regex: rx } },
        { startHour: { $regex: rx } },
        { finishHour: { $regex: rx } },
        ...(searchedUserIds.length ? [{ user: { $in: searchedUserIds } }] : []),
        ...(searchedLocationIds.length
          ? [{ location: { $in: searchedLocationIds } }]
          : []),
        ...(searchedGameplayIds.length
          ? [{ gameplay: { $in: searchedGameplayIds } }]
          : []),
        ...(searchedTableIds.length
          ? [{ table: { $in: searchedTableIds } }]
          : []),
      ];
      if (isNumeric) {
        orConds.push({ _id: numeric as any });
        orConds.push({ gameplay: numeric as any });
        orConds.push({ table: numeric as any });
      }
      if (orConds.length) {
        filter.$or = orConds;
      }
    }

    try {
      const [data, totalNumber] = await Promise.all([
        this.gameplayTimeModel
          .find(filter)
          .populate('gameplay', 'mentor game playerCount')
          .populate('table', '_id name')
          .sort(sortObject)
          .skip(skip)
          .limit(limitNum)
          .lean()
          .exec(),
        this.gameplayTimeModel.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(totalNumber / limitNum);
      return {
        data,
        totalNumber,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch gameplay time records',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseLocalDate(dateString: string): Date {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }
    return date;
  }

  async findById(id: string): Promise<GameplayTime> {
    const gameplayTimeRecord = await this.gameplayTimeModel.findById(id);
    if (!gameplayTimeRecord) {
      throw new HttpException(
        'Gameplay time record not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return gameplayTimeRecord;
  }

  async findByLocation(location: number): Promise<GameplayTime[]> {
    return this.gameplayTimeModel
      .find({ location, finishHour: { $exists: false } })
      .sort({ date: -1 })
      .exec();
  }

  async findByDate(date: string): Promise<GameplayTime[]> {
    return this.gameplayTimeModel
      .find({ date, finishHour: { $exists: false } })
      .populate('gameplay', 'mentor game playerCount')
      .sort({ startHour: 1 })
      .exec();
  }

  async update(
    id: string,
    updateGameplayTimeDto: UpdateGameplayTimeDto,
  ): Promise<GameplayTime> {
    try {
      const updatedGameplayTime =
        await this.gameplayTimeModel.findByIdAndUpdate(
          id,
          updateGameplayTimeDto,
          { new: true },
        );

      if (!updatedGameplayTime) {
        throw new HttpException(
          'Gameplay time record not found',
          HttpStatus.NOT_FOUND,
        );
      }

      this.websocketGateway.emitGameplayTimeChanged();
      return updatedGameplayTime;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update gameplay time record',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async delete(id: string): Promise<GameplayTime> {
    const deletedGameplayTime = await this.gameplayTimeModel.findByIdAndDelete(
      id,
    );
    if (!deletedGameplayTime) {
      throw new HttpException(
        'Gameplay time record not found',
        HttpStatus.NOT_FOUND,
      );
    }

    this.websocketGateway.emitGameplayTimeChanged();
    return deletedGameplayTime;
  }

  async deleteByGameplayId(gameplayId: number): Promise<void> {
    await this.gameplayTimeModel.deleteMany({ gameplay: gameplayId });
    this.websocketGateway.emitGameplayTimeChanged();
  }
}
