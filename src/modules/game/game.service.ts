import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import { getGameDetails } from '../../lib/bgg';
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
    @InjectModel('BggGame')
    private bggGameModel: Model<BggGame>,
    @InjectModel(RequestedGame.name)
    private requestedGameModel: Model<RequestedGame>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
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

  async getRequestedGames() {
    return this.requestedGameModel
      .find()
      .sort({ totalRequestCount: -1, updatedAt: -1 })
      .lean();
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
