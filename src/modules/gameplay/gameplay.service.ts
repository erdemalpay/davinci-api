import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameplayQueryDto } from './dto/gameplay-query.dto';
import { GameplayDto } from './dto/gameplay.dto';
import { PartialGameplayDto } from './dto/partial-gameplay.dto';
import { Gameplay } from './gameplay.schema';

@Injectable()
export class GameplayService {
  constructor(
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>, // @InjectModel(Game.name) private gameModel: Model<Game>,
  ) {}

  create(createGameplayDto: GameplayDto) {
    return this.gameplayModel.create(createGameplayDto);
  }

  findAll() {
    return this.gameplayModel.find();
  }

  async groupByField(query: GameplayQueryDto) {
    const matchQuery = {
      date: { $gte: query.startDate },
      location: {
        $in: query.location.split(',').map((location) => Number(location)),
      },
    };
    if (query.endDate) {
      matchQuery.date['$lte'] = query.endDate;
    }

    return this.gameplayModel.aggregate([
      { $match: matchQuery },
      { $group: { _id: `$${query.field}`, playCount: { $sum: 1 } } },
      { $sort: { playCount: -1 } },
      { $limit: Number(query.limit) },
    ]);
    // return this.gameModel.populate(result, { path: 'game' });
  }

  findOne(id: number) {
    return this.gameplayModel.find({ _id: id });
  }

  update(id: number, partialGameplayDto: PartialGameplayDto) {
    return this.gameplayModel.findOneAndUpdate(
      { _id: id },
      partialGameplayDto,
      {
        new: true,
      },
    );
  }

  remove(id: number) {
    return this.gameplayModel.findOneAndDelete({ _id: id });
  }
}
