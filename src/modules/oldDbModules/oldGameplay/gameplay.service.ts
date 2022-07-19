import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gameplay } from './gameplay.schema';

@Injectable()
export class OldGameplayService {
  constructor(
    @InjectModel(Gameplay.name) private GameplayModel: Model<Gameplay>,
  ) {}

  async getAll(): Promise<Gameplay[]> {
    return this.GameplayModel.find({});
  }
}
