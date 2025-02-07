import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addDays, format } from 'date-fns';
import { Model, PipelineStage } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { User } from '../user/user.schema';
import {
  GameplayQueryDto,
  GameplayQueryGroupDto,
} from './dto/gameplay-query.dto';
import { GameplayDto } from './dto/gameplay.dto';
import { PartialGameplayDto } from './dto/partial-gameplay.dto';
import { GameplayGateway } from './gameplay.gateway';
import { Gameplay } from './gameplay.schema';

@Injectable()
export class GameplayService {
  constructor(
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
    private readonly activityService: ActivityService,
    private readonly gameplayGateway: GameplayGateway,
  ) {}

  async create(user: User, createGameplayDto: GameplayDto) {
    const gameplay = await this.gameplayModel.create({
      ...createGameplayDto,
      createdBy: user,
    });
    this.gameplayGateway.emitGameplayChanged(user, gameplay);
    return gameplay;
  }

  findAll() {
    return this.gameplayModel.find();
  }

  async groupByField(query) {
    const matchQuery = {
      date: { $gte: query.startDate },
      ...(query.location !== '1,2'
        ? { location: { $in: query.location.split(',').map(Number) } }
        : {}),
    };
    if (query.endDate) {
      matchQuery.date['$lte'] = query.endDate;
    }
    if (query.mentor) {
      matchQuery['mentor'] = query.mentor;
    }

    return this.gameplayModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: `$${query.field}`,
          uniqueCount: { $addToSet: '$game' },
          playCount: { $sum: 1 },
        },
      },
      {
        $project: {
          uniqueCount: { $size: '$uniqueCount' },
          playCount: 1,
        },
      },
      { $sort: { uniqueCount: -1 } },
      { $limit: Number(query.limit) },
    ]);
  }

  async queryData(query: GameplayQueryDto) {
    const filterQuery = {};
    const {
      location,
      startDate,
      endDate,
      game,
      mentor,
      page,
      limit,
      sort,
      asc,
      groupBy,
    } = query;

    // Existing filter logic
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
    if (location) {
      filterQuery['location'] = location;
    }

    // Check if groupBy exists, and if so, use aggregation
    if (groupBy && groupBy.length) {
      // Initial grouping object
      const initialGroup: any = {
        _id: {},
        total: { $sum: 1 },
      };
      groupBy.forEach((field) => {
        initialGroup._id[field] = `$${field}`;
      });

      const aggregation = [{ $match: filterQuery }, { $group: initialGroup }];

      // If there's more than one field, we want to create nested groups
      if (groupBy.length > 1) {
        const secondaryGroups = groupBy.slice(1).map((field) => {
          return {
            $group: {
              _id: `$_id.${groupBy[0]}`,
              [field]: {
                $push: {
                  field: `$_id.${field}`,
                  count: '$total',
                },
              },
              total: { $sum: '$total' },
            },
          };
        });
        aggregation.push(...secondaryGroups);
      }

      const items = await this.gameplayModel.aggregate(aggregation).exec();
      return { totalCount: items.length, items };
    }

    // Existing sorting logic (used when groupBy is not provided)
    const sortObject = {};
    if (sort) {
      sortObject[sort] = asc;
    }

    const totalCount = await this.gameplayModel.countDocuments(filterQuery);
    const items = await this.gameplayModel
      .find(filterQuery)
      .sort(sortObject)
      .skip(page ? (page - 1) * limit : 0)
      .limit(limit || 0)
      .populate({ path: 'mentor', select: 'name' })
      .populate({ path: 'game', select: 'name' });
    return { totalCount, items };
  }
  async groupGameMentorLocation() {
    return this.gameplayModel.aggregate([
      {
        $match: {
          playerCount: { $gte: 1, $lte: 50 },
        },
      },
      {
        $group: {
          _id: { game: '$game', location: '$location' },
          mentors: { $push: '$mentor' },
          location: { $first: '$location' },
        },
      },
      {
        $project: {
          _id: 0,
          game: '$_id.game',
          location: 1,
          mentors: 1,
        },
      },
      {
        $unwind: '$mentors',
      },
      {
        $group: {
          _id: { game: '$game', location: '$location', mentor: '$mentors' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: { game: '$_id.game', location: '$_id.location' },
          secondary: {
            $push: {
              field: '$_id.mentor',
              count: '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
      {
        $project: {
          _id: '$_id.game',
          location: '$_id.location',
          secondary: 1,
          total: 1,
        },
      },
    ]);
  }

  async queryGroupData(query: GameplayQueryGroupDto) {
    const filterQuery = { playerCount: { $gte: 1, $lte: 50 } };
    const { startDate, endDate, groupBy, location } = query;
    // Existing filter logic
    if (startDate || endDate) {
      filterQuery['date'] = {};
    }
    if (endDate) {
      filterQuery['date']['$lte'] = endDate;
    }
    if (startDate) {
      filterQuery['date']['$gte'] = startDate;
    }
    if (location && location !== '0') {
      filterQuery['location'] = Number(location);
    }
    // Initial grouping object
    const initialGroup: any = {
      _id: {},
      total: { $sum: 1 },
    };
    groupBy.forEach((field) => {
      initialGroup._id[field] = `$${field}`;
    });

    const aggregation: PipelineStage[] = [
      { $match: filterQuery },
      { $group: initialGroup },
      { $sort: { total: -1 } },
    ];

    const secondaryGroups = groupBy.slice(1).map((field) => {
      return {
        $group: {
          _id: `$_id.${groupBy[0]}`,
          secondary: {
            $push: {
              field: `$_id.${field}`,
              count: '$total',
            },
          },
          total: { $sum: '$total' },
        },
      };
    });
    secondaryGroups.forEach((group) => {
      aggregation.push(group);
      aggregation.push({ $unwind: '$secondary' });
      aggregation.push({ $sort: { 'secondary.count': -1 } }); // Sort by count (descending) for the nested group
      aggregation.push({ $sort: { total: -1 } }); // Sort by total (descending) for the main group
      aggregation.push({
        $group: {
          _id: '$_id',
          secondary: { $push: '$secondary' },
          total: { $first: '$total' },
        },
      });
    });

    return this.gameplayModel.aggregate(aggregation).exec();
  }
  async getAfterGivenDateCreatedByCounts(after: string, before?: string) {
    const endDate =
      before !== '' && before !== undefined && before !== null
        ? format(addDays(new Date(before), 1), 'yyyy-MM-dd')
        : format(addDays(new Date(), 1), 'yyyy-MM-dd');

    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          date: {
            $gte: after,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: '$createdBy', // Group directly by createdBy field
          gameplayCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          createdBy: '$_id',
          gameplayCount: 1,
        },
      },
    ];

    const results = await this.gameplayModel
      .aggregate(aggregationPipeline)
      .exec();
    return results;
  }
  async getAfterGivenDateMentoredCounts(after: string, before?: string) {
    const endDate =
      before !== '' && before !== undefined && before !== null
        ? format(addDays(new Date(before), 1), 'yyyy-MM-dd')
        : format(addDays(new Date(), 1), 'yyyy-MM-dd');

    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          date: {
            $gte: after,
            $lte: endDate,
          },
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: 'game',
          foreignField: '_id',
          as: 'gameDetails',
        },
      },
      {
        $unwind: '$gameDetails',
      },
      {
        $group: {
          _id: '$mentor',
          gameplayCount: { $sum: 1 },
          totalNarrationDurationPoint: {
            $sum: '$gameDetails.narrationDurationPoint',
          },
        },
      },
      {
        $project: {
          _id: 0,
          mentoredBy: '$_id',
          gameplayCount: 1,
          totalNarrationDurationPoint: 1,
        },
      },
    ];
    const results = await this.gameplayModel
      .aggregate(aggregationPipeline)
      .exec();
    return results;
  }

  findById(id: number) {
    return this.gameplayModel.findById(id);
  }
  findByMentor(mentor: string) {
    return this.gameplayModel.find({
      mentor,
      playerCount: { $gte: 1, $lte: 50 },
    });
  }
  async findEarliestGamesByMentor(mentor: string) {
    try {
      const gameplays = await this.gameplayModel.aggregate([
        {
          $match: {
            mentor: mentor,
          },
        },
        {
          $group: {
            _id: '$game',
            earliestDate: { $min: '$date' },
          },
        },
        {
          $project: {
            _id: 0,
            game: '$_id',
            learnDate: '$earliestDate',
          },
        },
      ]);

      return gameplays;
    } catch (error) {
      console.error('Error finding earliest games by mentor:', error);
      throw error;
    }
  }
  async update(user: User, id: number, partialGameplayDto: PartialGameplayDto) {
    const existingGameplay = await this.gameplayModel.findById(id);
    const updatedGameplay = await this.gameplayModel.findByIdAndUpdate(
      id,
      partialGameplayDto,
      {
        new: true,
      },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_GAMEPLAY,
      existingGameplay,
      updatedGameplay,
    );
    this.gameplayGateway.emitGameplayChanged(user, updatedGameplay);
    return updatedGameplay;
  }

  async remove(user: User, id: number) {
    const gameplay = await this.gameplayModel.findByIdAndDelete(id);
    this.gameplayGateway.emitGameplayChanged(user, gameplay);
    return gameplay;
  }

  async close(user: User, id: number, finishHour: string) {
    const gameplay = await this.gameplayModel.findByIdAndUpdate(
      id,
      {
        finishHour,
      },
      { new: true },
    );
    this.gameplayGateway.emitGameplayChanged(user, gameplay);

    return gameplay;
  }
}
