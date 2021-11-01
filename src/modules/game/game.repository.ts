import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel, Query } from 'mongoose';
import { Game } from './game.schema';



@Injectable()
export class ItemRepository {
  constructor(
    @InjectModel(Game.name)
    private gameModel: PaginateModel<Game>,
  ) {}

  deleteGame(gameId: number) {
    return this.gameModel.deleteOne({ id: gameId });
  }

  async getGame(gameId: number) {
    return this.gameModel.findOne({ id: gameId });
  }



}