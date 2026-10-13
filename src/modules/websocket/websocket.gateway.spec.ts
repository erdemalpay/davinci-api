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
});
