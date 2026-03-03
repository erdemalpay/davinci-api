import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { GameplayService } from '../gameplay/gameplay.service';
import { LocationService } from '../location/location.service';
import { TableService } from '../table/table.service';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { buildPaginationParams, totalPages } from 'src/utils/queryUtils';
import {
  assertFound,
  toPlainObject,
  tryAddActivity,
  wrapHttpException,
} from 'src/utils/serviceUtils';
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
    private readonly activityService: ActivityService,
    private readonly gameplayService: GameplayService,
    @Inject(forwardRef(() => TableService))
    private readonly tableService: TableService,
  ) {}

  async create(
    createGameplayTimeDto: CreateGameplayTimeDto,
  ): Promise<GameplayTime> {
    return wrapHttpException(async () => {
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
      await tryAddActivity(
        this.activityService,
        this.userService,
        createGameplayTimeDto.user,
        ActivityType.START_GAMEPLAY_TIME,
        toPlainObject(gameplayTimeRecord),
        'start gameplay time',
      );
      this.websocketGateway.emitGameplayTimeChanged();
      return gameplayTimeRecord;
    }, 'Failed to create gameplay time record');
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
      rangeFilter.$gte = this.parseLocalDate(after);
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
      sortObject[sort === 'date' ? 'createdAt' : sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }

    const { pageNum, limitNum, skip } = buildPaginationParams(
      query.page,
      query.limit,
    );

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
      if (orConds.length) filter.$or = orConds;
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

      return {
        data,
        totalNumber,
        totalPages: totalPages(totalNumber, limitNum),
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
    assertFound(gameplayTimeRecord, 'Gameplay time record not found');
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
    return wrapHttpException(async () => {
      const updatedGameplayTime =
        await this.gameplayTimeModel.findByIdAndUpdate(
          id,
          updateGameplayTimeDto,
          { new: true },
        );
      assertFound(updatedGameplayTime, 'Gameplay time record not found');

      if (updateGameplayTimeDto.finishHour) {
        await tryAddActivity(
          this.activityService,
          this.userService,
          updatedGameplayTime.user,
          ActivityType.FINISH_GAMEPLAY_TIME,
          toPlainObject(updatedGameplayTime),
          'finish gameplay time',
        );
      }

      this.websocketGateway.emitGameplayTimeChanged();
      return updatedGameplayTime;
    }, 'Failed to update gameplay time record');
  }

  async delete(id: string): Promise<GameplayTime> {
    const deletedGameplayTime = await this.gameplayTimeModel.findByIdAndDelete(
      id,
    );
    assertFound(deletedGameplayTime, 'Gameplay time record not found');
    this.websocketGateway.emitGameplayTimeChanged();
    return deletedGameplayTime;
  }

  async deleteByGameplayId(gameplayId: number): Promise<void> {
    await this.gameplayTimeModel.deleteMany({ gameplay: gameplayId });
    this.websocketGateway.emitGameplayTimeChanged();
  }
}
