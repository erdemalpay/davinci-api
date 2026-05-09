import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getBggThing } from 'bgg-xml-api-client';
import { Model, UpdateQuery } from 'mongoose';
import { mapGames } from 'src/lib/mappers';
import { getItems } from 'src/lib/mongo';
import {
  ensureBggHeaders,
  getGameDetails,
  searchBggGames,
} from '../../lib/bgg';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { BggGame } from './bgg-game.schema';
import { GameDto } from './game.dto';
import { Game } from './game.schema';
import { RequestGameDto } from './requested-game.dto';
import { RequestedGame } from './requested-game.schema';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name)
    private gameModel: Model<Game>,
    @InjectModel('BggGame')
    private bggGameModel: Model<BggGame>,
    @InjectModel(RequestedGame.name)
    private requestedGameModel: Model<RequestedGame>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {}

  private normalizeGameName(name: string) {
    return name.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  }

  private escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getGames() {
    return this.gameModel.find().populate('bggId');
  }

  async getGamesMinimal() {
    try {
      const redisGamesMinimal = await this.redisService.get(
        RedisKeys.GamesMinimal,
      );
      if (redisGamesMinimal) {
        return redisGamesMinimal;
      }
    } catch (error) {
      console.error('Failed to retrieve minimal games from Redis:', error);
    }

    try {
      const gamesMinimal = await this.gameModel
        .find()
        .select('_id name')
        .exec();

      if (gamesMinimal.length > 0) {
        await this.redisService.set(RedisKeys.GamesMinimal, gamesMinimal);
      }
      return gamesMinimal;
    } catch (error) {
      console.error('Failed to retrieve minimal games from database:', error);
      throw new HttpException(
        'Could not retrieve minimal games',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  getGameById(gameId: number) {
    return this.gameModel.findById(gameId).populate('bggId');
  }

  async getGameDetails(gameId: number) {
    return getGameDetails(gameId);
  }

  async addGame(gameId: number) {
    const gameDetails = await getGameDetails(gameId);
    this.websocketGateway.emitGameChanged();
    return this.gameModel.create(gameDetails);
  }

  async addGameByDetails(gameDetails: GameDto) {
    const game = await (
      await this.gameModel.create(gameDetails)
    ).populate('bggId');
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async update(id: number, gameDetails: UpdateQuery<Game>) {
    const game = await this.gameModel
      .findByIdAndUpdate(id, gameDetails, { new: true })
      .populate('bggId');
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async remove(id: number) {
    const game = await this.gameModel.findByIdAndDelete(id);
    this.websocketGateway.emitGameChanged();
    return game;
  }

  async migrateGames() {
    const games = await getItems('games');
    const mappedGames = mapGames(games);
    this.gameModel.insertMany(mappedGames);
  }

  async getBggGamesOnly() {
    return this.bggGameModel.find();
  }

  async getBggCandidates(gameId: number, query?: string) {
    const game = await this.gameModel
      .findById(gameId)
      .select('_id name bggId')
      .lean();

    if (!game) {
      throw new HttpException(
        `Oyun bulunamadı: ${gameId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const searchQuery = query?.trim() || game.name;
    const candidates = await searchBggGames(searchQuery, 8);

    return {
      gameId: Number(game._id),
      gameName: game.name,
      searchedWith: searchQuery,
      currentBggId: game.bggId ?? null,
      candidates,
    };
  }

  private val(v: any): number | undefined {
    return v?.value !== undefined && v.value !== 'N/A'
      ? Number(v.value)
      : undefined;
  }

  private async fetchBggItem(
    id: number,
  ): Promise<{ item: any; ratings: any } | null> {
    ensureBggHeaders();
    const response = await getBggThing({ id, stats: 1 } as any);
    const raw = response.data?.item;
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    return { item, ratings: item.statistics?.ratings };
  }

  private buildBggSetFields(item: any, ratings: any, name?: string) {
    return {
      ...(name !== undefined ? { name } : {}),
      playersMin: this.val(item.minplayers),
      playersMax: this.val(item.maxplayers),
      playingTime: this.val(item.playingtime),
      playTimeMin: this.val(item.minplaytime),
      playTimeMax: this.val(item.maxplaytime),
      geekRating: this.val(ratings?.bayesaverage),
      avgWeight: this.val(ratings?.averageweight),
      avgRating: this.val(ratings?.average),
      ratingVotes: this.val(ratings?.usersrated),
    };
  }

  async assignBggId(gameId: number, bggId: number) {
    let bggGame = await this.bggGameModel.findById(bggId).lean();
    const isIncomplete = bggGame && bggGame.playersMin === undefined;

    if (!bggGame || isIncomplete) {
      let fetched: { item: any; ratings: any } | null = null;
      try {
        fetched = await this.fetchBggItem(bggId);
      } catch {
        if (!bggGame) {
          throw new HttpException(
            `BGG'de oyun bulunamadı: ${bggId}`,
            HttpStatus.NOT_FOUND,
          );
        }
      }

      if (fetched) {
        const { item, ratings } = fetched;
        const names = Array.isArray(item.name) ? item.name : [item.name];
        const primaryName =
          names.find((n: any) => n?.type === 'primary')?.value ??
          names[0]?.value ??
          bggGame?.name;

        await this.bggGameModel.updateOne(
          { _id: bggId },
          { $set: this.buildBggSetFields(item, ratings, primaryName) },
          { upsert: true },
        );

        bggGame = (await this.bggGameModel.findById(bggId).lean()) as any;
      } else if (!bggGame) {
        throw new HttpException(
          `BGG'de oyun bulunamadı: ${bggId}`,
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const game = await this.gameModel.findByIdAndUpdate(
      gameId,
      { $set: { bggId } },
      { new: true },
    );

    if (!game) {
      throw new HttpException(
        `Oyun bulunamadı: ${gameId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      gameId: Number(game._id),
      gameName: game.name,
      bggId,
      bggName: bggGame.name,
      addedToBggCollection: true,
    };
  }

  async refetchMissingBggData() {
    const gamesWithBggId = await this.gameModel
      .find({ bggId: { $exists: true, $ne: null } })
      .select('bggId')
      .lean();

    const bggIds = gamesWithBggId.map((g) => Number(g.bggId));

    const incomplete = await this.bggGameModel
      .find({ _id: { $in: bggIds }, playersMin: { $exists: false } })
      .select('_id name')
      .lean();

    const updated: { id: number; name: string }[] = [];
    const failed: { id: number; name: string }[] = [];

    for (const bggGame of incomplete) {
      try {
        const fetched = await this.fetchBggItem(Number(bggGame._id));

        if (!fetched) {
          failed.push({ id: Number(bggGame._id), name: bggGame.name });
          continue;
        }

        const { item, ratings } = fetched;

        await this.bggGameModel.updateOne(
          { _id: Number(bggGame._id) },
          { $set: this.buildBggSetFields(item, ratings) },
        );

        updated.push({ id: Number(bggGame._id), name: bggGame.name });

        await new Promise((resolve) => setTimeout(resolve, 400));
      } catch (err) {
        console.error(
          `BGG refetch failed for ${bggGame._id} (${bggGame.name}):`,
          (err as any)?.message ?? err,
        );
        failed.push({ id: Number(bggGame._id), name: bggGame.name });
      }
    }

    return {
      total: incomplete.length,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed,
    };
  }

  async getBggGamesAutocompleteOptions() {
    const games = await this.bggGameModel.find().select('name -_id').lean();
    return games.map((game) => ({ value: game.name }));
  }

  async getRequestedGames() {
    return this.requestedGameModel
      .find()
      .sort({ totalRequestCount: -1, updatedAt: -1 })
      .lean();
  }

  async requestGame(requestGameDto: RequestGameDto) {
    const email = requestGameDto.email.trim().toLocaleLowerCase('en-US');
    const name = requestGameDto.name.trim();
    const matchedBggGame = await this.bggGameModel
      .findOne({
        name: {
          $regex: `^${this.escapeRegex(name)}$`,
          $options: 'i',
        },
      })
      .select('_id name')
      .lean();

    const matchedBggGameId = matchedBggGame
      ? Number(matchedBggGame._id)
      : undefined;
    const canonicalName = matchedBggGame?.name ?? name;
    const normalizedName = this.normalizeGameName(canonicalName);

    let requestedGame = await this.requestedGameModel.findOne(
      matchedBggGameId
        ? { $or: [{ normalizedName }, { bggGameId: matchedBggGameId }] }
        : { normalizedName },
    );

    if (!requestedGame) {
      const created = await this.requestedGameModel.create({
        name: canonicalName,
        normalizedName,
        bggGameId: matchedBggGameId,
        totalRequestCount: 1,
        requestList: [{ email, requestedAt: new Date() }],
      });

      return {
        status: 'created',
        totalRequestCount: created.totalRequestCount,
        requestListCount: created.requestList.length,
        game: created,
      };
    }

    const alreadyRequested = requestedGame.requestList.some(
      (request) => request.email === email,
    );

    if (alreadyRequested) {
      throw new ConflictException('This email has already requested this game');
    }

    const updateResult = await this.requestedGameModel.updateOne(
      {
        _id: requestedGame._id,
        'requestList.email': { $ne: email },
      },
      {
        $push: {
          requestList: {
            email,
            requestedAt: new Date(),
          },
        },
        $inc: { totalRequestCount: 1 },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new ConflictException('This email has already requested this game');
    }

    requestedGame = await this.requestedGameModel.findById(requestedGame._id);

    return {
      status: 'updated',
      totalRequestCount: requestedGame?.totalRequestCount ?? 0,
      requestListCount: requestedGame?.requestList.length ?? 0,
      game: requestedGame,
    };
  }
}
