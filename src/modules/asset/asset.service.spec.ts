import { AssetService } from './asset.service';

jest.mock('../menu/menu.service', () => ({
  MenuService: class MenuService {},
}));
jest.mock('../customer-popup/customer-popup.service', () => ({
  CustomerPopupService: class CustomerPopupService {},
}));
jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));
jest.mock('../redis/redis.service', () => ({
  RedisService: class RedisService {},
}));

describe('AssetService.getScreenImages', () => {
  const images = [
    { url: 'a.jpg', publicId: 'tv-screen/a', duration: 10 },
    { url: 'spoonful.jpg', publicId: 'tv-screen/spoonful', duration: 300 },
    { url: 'b.jpg', publicId: 'tv-screen/b', duration: 20 },
  ];

  const setup = () => {
    jest.spyOn(console, 'log').mockImplementation();
    const redisService = { get: jest.fn().mockResolvedValue(images) };
    const customerPopupService = {
      findHiddenTvImagePublicIds: jest
        .fn()
        .mockResolvedValue(new Set(['tv-screen/spoonful'])),
    };
    const screenImageModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    };
    const websocketGateway = {
      emitAssetChanged: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AssetService(
      { get: jest.fn() } as never,
      websocketGateway as never,
      redisService as never,
      {} as never,
      customerPopupService as never,
      {} as never,
      screenImageModel as never,
    );
    return { service, customerPopupService, screenImageModel };
  };

  afterEach(() => jest.restoreAllMocks());

  it('returns every image to the panel, keeping order and durations', async () => {
    const { service, customerPopupService } = setup();

    expect(await service.getScreenImages()).toEqual(images);
    expect(
      customerPopupService.findHiddenTvImagePublicIds,
    ).not.toHaveBeenCalled();
  });

  it('leaves out hidden campaign images for the TV, keeping the rest in order', async () => {
    const { service, customerPopupService } = setup();

    expect(await service.getScreenImages(2)).toEqual([images[0], images[2]]);
    expect(
      customerPopupService.findHiddenTvImagePublicIds,
    ).toHaveBeenCalledWith(2);
  });

  it('keeps settings of hidden images when the panel saves', async () => {
    const { service, screenImageModel } = setup();

    const saved = await service.updateScreenImages(
      images.map(({ publicId, duration }) => ({ publicId, duration })),
    );

    expect(screenImageModel.deleteMany).toHaveBeenCalledWith({
      publicId: { $nin: images.map(({ publicId }) => publicId) },
    });
    expect(saved).toEqual(images);
  });
});
