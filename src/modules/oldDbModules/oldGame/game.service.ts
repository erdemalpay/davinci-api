import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game } from './game.schema';

@Injectable()
export class OldGameService {
  constructor(@InjectModel(Game.name) private gameModel: Model<Game>) {}

  async getAll(): Promise<Game[]> {
    return this.gameModel.find({});
  }
}
