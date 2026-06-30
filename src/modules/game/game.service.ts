import {
  ConflictException,
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import { getGameDetails } from '../../lib/bgg';
import { BackInStockService } from '../back-in-stock/back-in-stock.service';
import { Gameplay } from '../gameplay/gameplay.schema';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { BggGame } from './bgg-game.schema';
import { GameDto } from './game.dto';
import { Game } from './game.schema';
import { RequestGameDto } from './requested-game.dto';
import { RequestedGame } from './requested-game.schema';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name)
    private gameModel: Model<Game>,
    @InjectModel(Gameplay.name)
    private gameplayModel: Model<Gameplay>,
    @InjectModel('BggGame')
    private bggGameModel: Model<BggGame>,
    @InjectModel(RequestedGame.name)
    private requestedGameModel: Model<RequestedGame>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => BackInStockService))
    private readonly backInStockService: BackInStockService,
  ) {}

  private normalizeGameName(name: string) {
    return name.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  }

  private escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getGames() {
    return this.gameModel.find();
  }

  getGamesWithBgg() {
    return this.gameModel.find().populate('bggId');
  }

  async findAllGamesSortedByGameplayCount() {
    return this.gameModel
      .aggregate([
        {
          $lookup: {
            from: this.gameplayModel.collection.name,
            let: {
              gameId: '$_id',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$game', '$$gameId'],
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
            as: 'gameplayStats',
          },
        },
        {
          $lookup: {
            from: 'users',
            let: {
              gameId: '$_id',
            },
            pipeline: [
              {
                $match: {
                  active: true,
                  $expr: {
                    $in: ['$$gameId', '$userGames.game'],
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
            as: 'knownUserStats',
          },
        },
        {
          $addFields: {
            gameplayCount: {
              $ifNull: [
                {
                  $arrayElemAt: ['$gameplayStats.count', 0],
                },
                0,
              ],
            },
            knownUserCount: {
              $ifNull: [
                {
                  $arrayElemAt: ['$knownUserStats.count', 0],
                },
                0,
              ],
            },
          },
        },
        {
          $project: {
            gameplayStats: 0,
            knownUserStats: 0,
          },
        },
        {
          $sort: {
            gameplayCount: -1,
            name: 1,
          },
        },
      ])
      .exec();
  }

  async getGamesMinimal() {
    try {
      const redisGamesMinimal = await this.redisService.get(
        RedisKeys.GamesMinimal,
      );
      if (redisGamesMinimal) {
        return redisGamesMinimal;
      }
    } catch (error) {
      console.error('Failed to retrieve minimal games from Redis:', error);
    }

    try {
      const gamesMinimal = await this.gameModel
        .find()
        .select('_id name')
        .exec();

      if (gamesMinimal.length > 0) {
        await this.redisService.set(RedisKeys.GamesMinimal, gamesMinimal);
      }
      return gamesMinimal;
    } catch (error) {
      console.error('Failed to retrieve minimal games from database:', error);
      throw new HttpException(
        'Could not retrieve minimal games',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  getGameById(gameId: number) {
    return this.gameModel.findById(gameId);
  }

  async getGameDetails(gameId: number) {
    return getGameDetails(gameId);
  }

  async addGame(gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    this.websocketGateway.emitGameChanged();
    return this.gameModel.create(gameDetails);
  }

  async addGameByDetails(gameDetails: GameDto) {
    const game = await this.gameModel.create(gameDetails);
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async update(id: number, gameDetails: UpdateQuery<Game>) {
    const game = await this.gameModel.findByIdAndUpdate(id, gameDetails, {
      new: true,
    });
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async remove(id: number) {
    const game = await this.gameModel.findByIdAndDelete(id);
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }

  async getBggGamesOnly() {
    return this.bggGameModel.find();
  }
  async getBggGamesAutocompleteOptions() {
    const games = await this.bggGameModel.find().select('name -_id').lean();
    return games.map((game) => ({ value: game.name }));
  }

  async getRequestedGames(status?: string) {
    const filter = status ? { status } : {};

    return this.requestedGameModel
      .find(filter)
      .sort({ totalRequestCount: -1, updatedAt: -1 })
      .lean();
  }

  async adjustRequestedGameStatuses() {
    const result = await this.requestedGameModel.updateMany(
      {
        $or: [{ status: { $exists: false } }, { status: null }],
      },
      {
        $set: { status: 'requested' },
      },
    );

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  async updateRequestedGame(id: string, updates: UpdateQuery<RequestedGame>) {
    return this.requestedGameModel.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
  }

  async requestGame(requestGameDto: RequestGameDto) {
    const email = requestGameDto.email.trim().toLocaleLowerCase('en-US');
    const name = requestGameDto.name.trim();
    const matchedBggGame = await this.bggGameModel
      .findOne({
        name: {
          $regex: `^${this.escapeRegex(name)}$`,
          $options: 'i',
        },
      })
      .select('_id name')
      .lean();

    const matchedBggGameId = matchedBggGame
      ? Number(matchedBggGame._id)
      : undefined;
    const canonicalName = matchedBggGame?.name ?? name;
    const normalizedName = this.normalizeGameName(canonicalName);

    let requestedGame = await this.requestedGameModel.findOne(
      matchedBggGameId
        ? { $or: [{ normalizedName }, { bggGameId: matchedBggGameId }] }
        : { normalizedName },
    );

    if (!requestedGame) {
      const created = await this.requestedGameModel.create({
        name: canonicalName,
        normalizedName,
        bggGameId: matchedBggGameId,
        totalRequestCount: 1,
        requestList: [{ email, requestedAt: new Date() }],
      });

      return {
        status: 'created',
        totalRequestCount: created.totalRequestCount,
        requestListCount: created.requestList.length,
        game: created,
      };
    }

    const alreadyRequested = requestedGame.requestList.some(
      (request) => request.email === email,
    );

    if (alreadyRequested) {
      throw new ConflictException('This email has already requested this game');
    }

    const updateResult = await this.requestedGameModel.updateOne(
      {
        _id: requestedGame._id,
        'requestList.email': { $ne: email },
      },
      {
        $push: {
          requestList: {
            email,
            requestedAt: new Date(),
          },
        },
        $inc: { totalRequestCount: 1 },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new ConflictException('This email has already requested this game');
    }

    requestedGame = await this.requestedGameModel.findById(requestedGame._id);

    return {
      status: 'updated',
      totalRequestCount: requestedGame?.totalRequestCount ?? 0,
      requestListCount: requestedGame?.requestList.length ?? 0,
      game: requestedGame,
    };
  }
}
