import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addDays, format } from 'date-fns';
import { Model, PipelineStage } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { Game } from '../game/game.schema';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  GameplayQueryDto,
  GameplayQueryGroupDto,
} from './dto/gameplay-query.dto';
import { GameplayDto } from './dto/gameplay.dto';
import { PartialGameplayDto } from './dto/partial-gameplay.dto';
import { Gameplay } from './gameplay.schema';

@Injectable()
export class GameplayService {
  constructor(
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
    @InjectModel(Game.name) private gameModel: Model<Game>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly activityService: ActivityService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  async create(user: User, createGameplayDto: GameplayDto, tableId: number) {
    const gameplay = await this.gameplayModel.create({
      ...createGameplayDto,
      createdBy: user,
    });
    this.websocketGateway.emitGameplayCreated(user, gameplay, tableId);
    return gameplay;
  }

  findAll() {
    return this.gameplayModel.find();
  }

  async searchGameplayIds(search: string) {
    const searchRegex = new RegExp(search, 'i');
    const [mentorIds, gameIds] = await Promise.all([
      this.userModel
        .find({ name: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id)),
      this.gameModel
        .find({ name: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id)),
    ]);
    const searchGameplayIds = await this.gameplayModel
      .find({
        $or: [{ mentor: { $in: mentorIds } }, { game: { $in: gameIds } }],
      })
      .select('_id')
      .then((docs) => docs.map((doc) => doc._id));
    return searchGameplayIds;
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
    const {
      page = 1,
      limit = 10,
      location,
      startDate,
      endDate,
      game,
      mentor,
      sort,
      asc,
      groupBy,
      search,
    } = query;

    const filter: Record<string, unknown> = {};
    if (location !== undefined && location !== null && `${location}` !== '') {
      const locNum =
        typeof location === 'string' ? Number(location) : (location as number);
      filter.location = Number.isNaN(locNum) ? location : locNum;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchedGameIds = await this.gameModel
        .find({ name: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      const searchedMentorIds = await this.userModel
        .find({ name: { $regex: searchRegex } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      filter.$or = [
        { mentor: { $in: searchedMentorIds } },
        { game: { $in: searchedGameIds } },
      ];
    } else {
      if (game) filter.game = game;
      if (mentor) filter.mentor = mentor;
    }
    if (startDate || endDate) {
      const range: Record<string, Date> = {};
      if (startDate) {
        filter.date = { $gte: startDate };
      }
      if (endDate) {
        filter.date = {
          ...(typeof filter.date === 'object' && filter.date !== null
            ? filter.date
            : {}),
          $lte: endDate,
        };
      }
    }
    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      if (groupBy?.length) {
        if (sort === 'total') {
          sortObject['total'] = dir;
        } else {
          sortObject[`_id.${sort}`] = dir;
        }
      } else {
        sortObject[sort] = dir;
      }
    } else {
      if (groupBy?.length) {
        sortObject['total'] = -1;
      } else {
        sortObject['date'] = -1 as const;
      }
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    if (groupBy && groupBy.length) {
      const idSpec = groupBy.reduce<Record<string, string>>((acc, f) => {
        acc[f] = `$${f}`;
        return acc;
      }, {});

      const pipeline: PipelineStage[] = [
        { $match: filter },
        { $group: { _id: idSpec, total: { $sum: 1 } } },
      ];
      if (Object.keys(sortObject).length) {
        pipeline.push({ $sort: sortObject });
      }
      pipeline.push({
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          meta: [{ $count: 'totalNumber' }],
        },
      });

      const agg = await this.gameplayModel.aggregate(pipeline).exec();
      const first = agg[0] || { data: [], meta: [] };
      const data = first.data ?? [];
      const totalNumber = (first.meta?.[0]?.totalNumber as number) ?? 0;
      const totalPages = Math.ceil(totalNumber / limitNum);
      const normalized = data.map((row: Record<string, unknown>) => ({
        ...(typeof row._id === 'object' && row._id !== null ? row._id : {}),
        total: row.total,
      }));

      return {
        data: normalized,
        totalNumber,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
    }
    const [data, totalNumber] = await Promise.all([
      this.gameplayModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .populate({ path: 'mentor', select: 'name' })
        .populate({ path: 'game', select: 'name' })
        .lean()
        .exec(),
      this.gameplayModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalNumber / limitNum);

    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
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
    const initialGroup: {
      _id: Record<string, string>;
      total: { $sum: number };
    } = {
      _id: {},
      total: { $sum: 1 },
    };
    groupBy.forEach((field) => {
      initialGroup._id[field] = `$${field}`;
    });

    const aggregation: PipelineStage[] = [
      { $match: filterQuery },
      { $group: initialGroup as PipelineStage.Group['$group'] },
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
    this.websocketGateway.emitGameplayUpdated(user, updatedGameplay);
    return updatedGameplay;
  }

  async remove(user: User, id: number, tableId: number) {
    const gameplay = await this.gameplayModel.findByIdAndDelete(id);
    this.websocketGateway.emitGameplayDeleted(user, gameplay, tableId);
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
    this.websocketGateway.emitGameplayChanged(user, gameplay);

    return gameplay;
  }
  async givenDateTopMentorAndComplexGames(date: string, location: number) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          date,
          location: Number(location),
          mentor: { $nin: [null, '', 'dv', 'DV', 'Dv'] },
        },
      },
      {
        $facet: {
          topMentors: [
            { $group: { _id: '$mentor', gameplayCount: { $sum: 1 } } },
            { $sort: { gameplayCount: -1 } },
            { $project: { _id: 0, mentoredBy: '$_id', gameplayCount: 1 } },
          ],
          topComplexGames: [
            {
              $group: {
                _id: '$game',
                playCount: { $sum: 1 },
                mentors: { $addToSet: '$mentor' },
              },
            },
            {
              $lookup: {
                from: 'games',
                localField: '_id',
                foreignField: '_id',
                as: 'game',
              },
            },
            { $unwind: '$game' },
            { $sort: { 'game.narrationDurationPoint': -1 } },
            { $limit: 3 },
            {
              $project: {
                _id: 0,
                gameId: '$_id',
                name: '$game.name',
                narrationDurationPoint: '$game.narrationDurationPoint',
                mentors: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.gameplayModel.aggregate(pipeline).exec();
    return {
      topMentors: result.topMentors,
      topComplexGames: result.topComplexGames,
    };
  }

  async getGameplaysByDate(date: string) {
    return this.gameplayModel
      .find({ date })
      .populate({ path: 'mentor', select: 'name' })
      .populate({ path: 'game', select: 'name' })
      .exec();
  }

  async getGameplayCountsByDate(mentorId: string) {
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          mentor: mentorId,
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: '$date',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          day: '$_id',
          value: '$count',
        },
      },
      {
        $sort: { day: 1 },
      },
    ];

    const results = await this.gameplayModel
      .aggregate(aggregationPipeline)
      .exec();
    return results;
  }
}
