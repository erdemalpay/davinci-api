import { getGameDetails } from '../../lib/bgg';
import { Injectable } from '@nestjs/common';
import { Game } from './game.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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

  async deleteGame(gameId: number) {
    const $game = await this.getGameById(gameId);
    await this.gameModel.findByIdAndDelete(gameId);
  }

  async addGame(gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    const game = new Game(gameDetails);
    await game.save();
    return true;
  }
}
