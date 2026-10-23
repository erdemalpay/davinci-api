import { CONSUMER_APP, CONSUMER_ROOM } from '../consumerApp/consumerToken';
import { AppWebSocketGateway } from './websocket.gateway';

function build(verify: jest.Mock = jest.fn()) {
  const gateway = new AppWebSocketGateway(
    {} as never,
    { verify } as never,
    { get: () => 'secret' } as never,
  );
  const emit = jest.fn();
  const except = jest.fn().mockReturnValue({ emit });
  const toEmit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit: toEmit });
  gateway.server = { emit, except, to } as never;
  return { gateway, emit, except, to, toEmit };
}

const client = (auth: object) => ({
  handshake: { auth },
  join: jest.fn(),
});

describe('AppWebSocketGateway', () => {
  it('sends the created orders with createMultipleOrder', () => {
    const { gateway, emit, except } = build();
    const orders = [{ _id: 1, table: { _id: 3, name: '5' } }];

    gateway.emitCreateMultipleOrder(
      { _id: 'ali' } as never,
      { _id: 3 } as never,
      1,
      ['bar'],
      orders as never,
    );

    // Panel events don't go to the customer app.
    expect(except).toHaveBeenCalledWith(CONSUMER_ROOM);
    expect(emit).toHaveBeenCalledWith('createMultipleOrder', {
      user: { _id: 'ali' },
      table: { _id: 3 },
      locationId: 1,
      kitchenIds: ['bar'],
      orders,
    });
  });

  it('sends the menu events to everyone', () => {
    const { gateway, emit, except } = build();

    gateway.emitPopularChanged();

    expect(emit).toHaveBeenCalledWith('popularChanged');
    expect(except).not.toHaveBeenCalled();
  });

  it('puts the customer app in its rooms', () => {
    const verify = jest.fn().mockReturnValue({ type: 'consumer', consumer: 7 });
    const { gateway } = build(verify);
    const socket = client({ app: CONSUMER_APP, token: 'token' });

    gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith(CONSUMER_ROOM);
    expect(socket.join).toHaveBeenCalledWith('consumer:7');
  });

  it('keeps the customer app with an expired token out of the panel events', () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { gateway } = build(verify);
    const socket = client({ app: CONSUMER_APP, token: 'old' });

    gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith(CONSUMER_ROOM);
  });

  it('leaves the panel out of the consumer rooms', () => {
    const verify = jest.fn();
    const { gateway } = build(verify);
    const socket = client({});

    gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('tells only the given consumers that their table changed', () => {
    const { gateway, to, toEmit } = build();

    gateway.emitConsumerTableChanged([7, 9]);

    expect(to).toHaveBeenCalledWith(['consumer:7', 'consumer:9']);
    expect(toEmit).toHaveBeenCalledWith('myTableChanged');
  });
});
