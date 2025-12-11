import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import { getGameDetails } from '../../lib/bgg';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { GameDto } from './game.dto';
import { Game } from './game.schema';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name)
    private gameModel: Model<Game>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {}

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

  async addGame(user: User, gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    this.websocketGateway.emitGameChanged(user, gameDetails);
    return this.gameModel.create(gameDetails);
  }

  async addGameByDetails(user: User, gameDetails: GameDto) {
    const game = await this.gameModel.create(gameDetails);
    this.websocketGateway.emitGameChanged(user, game);
    return game;
  }

  async update(user: User, id: number, gameDetails: UpdateQuery<Game>) {
    const game = await this.gameModel.findByIdAndUpdate(id, gameDetails, {
      new: true,
    });
    this.websocketGateway.emitGameChanged(user, game);
    return game;
  }

  async remove(user: User, id: number) {
    const game = await this.gameModel.findByIdAndDelete(id);
    this.websocketGateway.emitGameChanged(user, game);
    return game;
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }
}
