import { RedisKeys } from '../redis/redis.dto';
import { GameCatalogService } from './game-catalog.service';

jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class ShopifyService {},
}));
jest.mock('../game/game.service', () => ({
  GameService: class GameService {},
}));

const websiteGame = {
  _id: 13,
  name: 'Catan',
  locations: [2],
  bggId: { PlayersMin: 3, PlayersMax: 4, PlayTimeMin: 60, AvgWeight: 2.28 },
};

describe('GameCatalogService.getCatalog', () => {
  const setup = (cached: unknown) => {
    const redisService = {
      get: jest.fn().mockResolvedValue(cached),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const shopifyService = {
      getGamesForWebSite: jest.fn().mockResolvedValue([websiteGame]),
    };
    const gameService = {
      findAllGamesSortedByGameplayCount: jest
        .fn()
        .mockResolvedValue([{ _id: 13, gameplayCount: 1930 }]),
    };
    const service = new GameCatalogService(
      redisService as never,
      shopifyService as never,
      gameService as never,
    );
    return { service, redisService, shopifyService };
  };

  it('returns the cached catalog without loading games', async () => {
    const { service, shopifyService } = setup([{ id: 1 }]);

    expect(await service.getCatalog()).toEqual([{ id: 1 }]);
    expect(shopifyService.getGamesForWebSite).not.toHaveBeenCalled();
  });

  it('builds the catalog with popularity and caches it', async () => {
    const { service, redisService } = setup(null);

    const catalog = await service.getCatalog();

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ id: 13, popularity: 1930 });
    expect(redisService.set).toHaveBeenCalledWith(
      RedisKeys.GameAssistantCatalog,
      catalog,
      600,
    );
  });
});
