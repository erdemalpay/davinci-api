import { getGameDetails } from '../../lib/bgg';
import { Injectable } from '@nestjs/common';
import { Game } from './game.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { getItems } from 'src/lib/mongo';
import { mapGames } from 'src/lib/mappers';
import { GameDto } from './game.dto';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name)
    private gameModel: Model<Game>,
  ) {}

  getGames() {
    return this.gameModel.find();
  }

  getGameById(gameId: number) {
    return this.gameModel.findById(gameId);
  }

  async getGameDetails(gameId: number) {
    return getGameDetails(gameId);
  }

  async addGame(gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    return this.gameModel.create(gameDetails);
  }

  async addGameByDetails(gameDetails: GameDto) {
    return this.gameModel.create(gameDetails);
  }

  async update(id: number, gameDetails: UpdateQuery<Game>) {
    return this.gameModel.findByIdAndUpdate(id, gameDetails, { new: true });
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }
}
