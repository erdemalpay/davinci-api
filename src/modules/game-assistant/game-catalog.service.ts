import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { GameService } from '../game/game.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { ShopifyService } from '../shopify/shopify.service';
import { GAME_ASSISTANT_LIMITS } from './game-assistant.constants';
import { CatalogGame, toCatalogGame, WebsiteGame } from './game-catalog';

@Injectable()
export class GameCatalogService {
  private readonly logger = new Logger(GameCatalogService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly shopifyService: ShopifyService,
    private readonly gameService: GameService,
  ) {}

  async getCatalog(): Promise<CatalogGame[]> {
    try {
      const cached = await this.redisService.get(
        RedisKeys.GameAssistantCatalog,
      );
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(`Failed to read catalog from Redis: ${error?.message}`);
    }

    const startDate = moment
      .tz('Europe/Istanbul')
      .subtract(GAME_ASSISTANT_LIMITS.popularityWindowDays, 'day')
      .format('YYYY-MM-DD');
    const [games, popular] = await Promise.all([
      this.shopifyService.getGamesForWebSite() as Promise<WebsiteGame[]>,
      this.gameService.findAllGamesSortedByGameplayCount(startDate) as Promise<
        { _id: number; gameplayCount: number }[]
      >,
    ]);
    const popularity = new Map(popular.map((g) => [g._id, g.gameplayCount]));
    const catalog = games
      .map((g) => toCatalogGame(g, popularity.get(g._id) ?? 0))
      .filter((g): g is CatalogGame => g !== null);

    try {
      await this.redisService.set(
        RedisKeys.GameAssistantCatalog,
        catalog,
        GAME_ASSISTANT_LIMITS.catalogCacheSeconds,
      );
    } catch (error) {
      this.logger.warn(`Failed to cache catalog in Redis: ${error?.message}`);
    }
    return catalog;
  }
}
