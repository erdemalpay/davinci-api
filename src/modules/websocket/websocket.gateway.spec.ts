import { AppWebSocketGateway } from './websocket.gateway';

describe('AppWebSocketGateway', () => {
  it('sends the created orders with createMultipleOrder', () => {
    const gateway = new AppWebSocketGateway({} as never);
    const emit = jest.fn();
    gateway.server = { emit } as never;
    const orders = [{ _id: 1, table: { _id: 3, name: '5' } }];

    gateway.emitCreateMultipleOrder(
      { _id: 'ali' } as never,
      { _id: 3 } as never,
      1,
      ['bar'],
      orders as never,
    );

    expect(emit).toHaveBeenCalledWith('createMultipleOrder', {
      user: { _id: 'ali' },
      table: { _id: 3 },
      locationId: 1,
      kitchenIds: ['bar'],
      orders,
    });
  });

  describe('emitStockChanged', () => {
    const build = () => {
      const reset = jest.fn().mockResolvedValue(undefined);
      const gateway = new AppWebSocketGateway({ reset } as never);
      const emit = jest.fn();
      gateway.server = { emit } as never;
      return { gateway, emit, reset };
    };

    it('sends the changed stocks with their revision', async () => {
      const { gateway, emit, reset } = build();

      await gateway.emitStockChanged([
        {
          _id: 'cola2',
          product: { _id: 'cola' },
          location: 2,
          quantity: 81,
          revision: 7,
        } as never,
      ]);

      expect(reset).toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('stockChanged', {
        stocks: [
          {
            _id: 'cola2',
            product: 'cola',
            location: 2,
            quantity: 81,
            revision: 7,
          },
        ],
      });
    });

    it('sends a bare stockChanged when no stock is given', async () => {
      const { gateway, emit } = build();

      await gateway.emitStockChanged();

      expect(emit).toHaveBeenCalledWith('stockChanged');
    });

    it('sends a bare stockChanged when the stock is gone', async () => {
      const { gateway, emit } = build();

      await gateway.emitStockChanged([null as never]);

      expect(emit).toHaveBeenCalledWith('stockChanged');
    });
  });
});
