import { getGameDetails } from '../../lib/bgg';
import { Injectable } from '@nestjs/common';
import { Game } from './game.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getItems } from 'src/lib/mongo';
import { mapGames } from 'src/lib/mappers';

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

  async addGame(gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    return this.gameModel.create(gameDetails);
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }
}
