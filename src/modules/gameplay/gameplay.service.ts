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
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
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
    if (query.mentor) {
      matchQuery['mentor'] = query.mentor;
    }

    return this.gameplayModel.aggregate([
      { $match: matchQuery },
      { $group: { _id: `$${query.field}`, playCount: { $sum: 1 } } },
      { $sort: { playCount: -1 } },
      { $limit: Number(query.limit) },
    ]);
  }

  async queryData(query: GameplayQueryDto) {
    const filterQuery = {};
    const { startDate, endDate, game, mentor, page, limit, sort, asc } = query;
    if (startDate || endDate) {
      filterQuery['date'] = {};
    }
    if (endDate) {
      filterQuery['date']['$lte'] = endDate;
    }
    if (startDate) {
      filterQuery['date']['$gte'] = startDate;
    }
    if (game) {
      filterQuery['game'] = game;
    }
    if (mentor) {
      filterQuery['mentor'] = mentor;
    }
    const sortObject = {};
    if (sort) {
      sortObject[sort] = asc;
    }

    const totalCount = await this.gameplayModel.count(filterQuery);
    const items = await this.gameplayModel
      .find(filterQuery)
      .sort(sortObject)
      .skip(page ? (page - 1) * limit : 0)
      .limit(limit || 0)
      .populate({ path: 'mentor', select: 'name' })
      .populate({ path: 'game', select: 'name' });
    return { totalCount, items };
  }

  findById(id: number) {
    return this.gameplayModel.findById(id);
  }

  update(id: number, partialGameplayDto: PartialGameplayDto) {
    return this.gameplayModel.findByIdAndUpdate(id, partialGameplayDto, {
      new: true,
    });
  }

  remove(id: number) {
    return this.gameplayModel.findByIdAndDelete(id);
  }

  close(id: number, finishHour: string) {
    return this.gameplayModel.findByIdAndUpdate(
      id,
      {
        finishHour,
      },
      { new: true },
    );
  }
}
