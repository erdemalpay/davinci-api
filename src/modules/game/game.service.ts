import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import { getGameDetails } from '../../lib/bgg';
import { User } from '../user/user.schema';
import { GameDto } from './game.dto';
import { GameGateway } from './game.gateway';
import { Game } from './game.schema';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name)
    private gameModel: Model<Game>,
    private readonly gameGateway: GameGateway,
  ) {}

  getGames() {
    return this.gameModel.find();
  }

  getGameById(gameId: number) {
    return this.gameModel.findById(gameId);
  }

  async getGameDetails(gameId: number) {

    const gameInDb = await this.gameModel.findById(gameId);
    if (gameInDb) {
      return gameInDb;
    }

    return getGameDetails(gameId);
  }

  async addGame(user: User, gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    this.gameGateway.emitGameChanged(user, gameDetails);
    return this.gameModel.create(gameDetails);
  }

  async addGameByDetails(user: User, gameDetails: GameDto) {
    const game = await this.gameModel.create(gameDetails);
    this.gameGateway.emitGameChanged(user, game);
    return game;
  }

  async update(user: User, id: number, gameDetails: UpdateQuery<Game>) {
    const game = await this.gameModel.findByIdAndUpdate(id, gameDetails, {
      new: true,
    });
    this.gameGateway.emitGameChanged(user, game);
    return game;
  }

  async remove(user: User, id: number) {
    const game = await this.gameModel.findByIdAndDelete(id);
    this.gameGateway.emitGameChanged(user, game);
    return game;
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }
}
