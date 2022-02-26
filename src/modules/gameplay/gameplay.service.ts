import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateGameplayDto } from './dto/create-gameplay.dto';
import { UpdateGameplayDto } from './dto/update-gameplay.dto';
import { Gameplay } from './gameplay.schema';

@Injectable()
export class GameplayService {
  constructor(
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
  ) {}
  create(createGameplayDto: CreateGameplayDto) {
    return this.gameplayModel.create(createGameplayDto);
  }

  findAll() {
    return this.gameplayModel.find();
  }

  findOne(id: number) {
    return this.gameplayModel.find({ _id: id });
  }

  update(id: number, updateGameplayDto: UpdateGameplayDto) {
    return this.gameplayModel.findOneAndUpdate({ _id: id }, updateGameplayDto, {
      new: true,
    });
  }

  remove(id: number) {
    return this.gameplayModel.findOneAndDelete({ _id: id });
  }
}
