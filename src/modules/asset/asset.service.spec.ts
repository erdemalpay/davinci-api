import * as cloudinary from 'cloudinary';
import { PassThrough } from 'stream';
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

describe('AssetService.uploadImages', () => {
  const setup = () => {
    jest.spyOn(console, 'log').mockImplementation();
    const uploadStream = jest
      .spyOn(cloudinary.v2.uploader, 'upload_stream')
      .mockImplementation(((
        options: { public_id: string },
        callback: (error: unknown, result: { secure_url: string }) => void,
      ) => {
        const stream = new PassThrough();
        stream.on('finish', () =>
          callback(undefined, {
            secure_url: `https://cdn/${options.public_id}`,
          }),
        );
        stream.resume();
        return stream;
      }) as never);
    const uploadLogModel = { create: jest.fn().mockResolvedValue({}) };
    const websocketGateway = { emitAssetChanged: jest.fn() };
    const service = new AssetService(
      { get: jest.fn() } as never,
      websocketGateway as never,
      {} as never,
      {} as never,
      {} as never,
      uploadLogModel as never,
      {} as never,
    );
    return { service, uploadStream, uploadLogModel };
  };

  afterEach(() => jest.restoreAllMocks());

  it('keeps Turkish characters in the file name multer reads as latin1', async () => {
    const { service, uploadStream, uploadLogModel } = setup();
    const latin1Name = Buffer.from('perimasalları2.webp', 'utf8').toString(
      'latin1',
    );

    await service.uploadImages(
      { name: 'Hilmi' } as never,
      [{ originalname: latin1Name, buffer: Buffer.from('x') } as never],
      'menu',
    );

    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      public_id: 'perimasalları2.webp',
    });
    expect(uploadLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'perimasalları2.webp',
        status: 'success',
      }),
    );
  });
});

describe('AssetService.uploadPopupImage', () => {
  const setup = () => {
    const uploadStream = jest
      .spyOn(cloudinary.v2.uploader, 'upload_stream')
      .mockImplementation(((
        _options: unknown,
        callback: (error: unknown, result: { secure_url: string }) => void,
      ) => {
        const stream = new PassThrough();
        stream.on('finish', () =>
          callback(undefined, { secure_url: 'https://cdn/a.jpg' }),
        );
        stream.resume();
        return stream;
      }) as never);
    const service = new AssetService(
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, uploadStream };
  };

  afterEach(() => jest.restoreAllMocks());

  it('limits the width to 800 pixels by default', async () => {
    const { service, uploadStream } = setup();
    await service.uploadPopupImage(Buffer.from('x'), 'a.jpg', 'menu');
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      transformation: { crop: 'limit', width: 800 },
    });
  });

  it('uses the width the panel asked for', async () => {
    const { service, uploadStream } = setup();
    await service.uploadPopupImage(
      Buffer.from('x'),
      'a.jpg',
      'event-calendar-backgrounds',
      1080,
    );
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      transformation: { crop: 'limit', width: 1080 },
    });
  });
});
