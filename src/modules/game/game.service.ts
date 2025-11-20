import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import { getGameDetails } from '../../lib/bgg';
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
  ) {}

  getGames() {
    return this.gameModel.find();
  }

  getGamesMinimal() {
    return this.gameModel.find().select('_id name');
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
