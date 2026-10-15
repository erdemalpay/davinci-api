import { CustomerPopupService } from './customer-popup.service';

jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

describe('CustomerPopupService.findHiddenTvImagePublicIds', () => {
  const setup = (
    linkedPopups: { tvImagePublicId: string }[],
    activePopups: { tvImagePublicId?: string }[],
  ) => {
    const customerPopupModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(linkedPopups),
      }),
    };
    const service = new CustomerPopupService(
      customerPopupModel as never,
      {} as never,
    );
    jest.spyOn(service, 'findActive').mockResolvedValue(activePopups as never);
    return { service, customerPopupModel };
  };

  it('hides images of popups not shown today at the location', async () => {
    const { service } = setup(
      [
        { tvImagePublicId: 'tv-screen/spoonful' },
        { tvImagePublicId: 'tv-screen/weekend' },
      ],
      [{ tvImagePublicId: 'tv-screen/weekend' }, {}],
    );

    const hidden = await service.findHiddenTvImagePublicIds(2);

    expect([...hidden]).toEqual(['tv-screen/spoonful']);
    expect(service.findActive).toHaveBeenCalledWith(2);
  });

  it('keeps an image shown when any of its popups is shown', async () => {
    const { service } = setup(
      [
        { tvImagePublicId: 'tv-screen/shared' },
        { tvImagePublicId: 'tv-screen/shared' },
      ],
      [{ tvImagePublicId: 'tv-screen/shared' }],
    );

    expect((await service.findHiddenTvImagePublicIds(2)).size).toBe(0);
  });

  it('includes deleted popups so their images stay hidden', async () => {
    const { service, customerPopupModel } = setup([], []);

    await service.findHiddenTvImagePublicIds(2);

    const [filter] = customerPopupModel.find.mock.calls[0];
    expect(filter).toEqual({ tvImagePublicId: { $nin: [null, ''] } });
    expect(filter).not.toHaveProperty('isDeleted');
  });
});
