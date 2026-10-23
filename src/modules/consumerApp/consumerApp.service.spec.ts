// table.service pulls in the Shopify service, whose node adapter jest can't load.
jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { hash } from 'bcrypt';
import { Model } from 'mongoose';
import { ConsumerStatus } from '../consumer/consumer.schema';
import { ConsumerService } from '../consumer/consumer.service';
import { TableService } from '../table/table.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { GameplayResult, TableCheckIn } from './consumerApp.schema';
import { ConsumerAppService } from './consumerApp.service';

// A mongoose query: chainable and awaitable, with lean() too.
const query = (value: unknown) => {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(value),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => void) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return chain;
};

function build({
  checkInModel = {},
  resultModel = {},
  consumerService = {},
  tableService = {},
}: {
  checkInModel?: object;
  resultModel?: object;
  consumerService?: object;
  tableService?: object;
} = {}) {
  const gateway = {
    emitConsumerTableChanged: jest.fn(),
    emitGameplayResultChanged: jest.fn(),
  };
  const sign = jest.fn().mockReturnValue('signed');
  const service = new ConsumerAppService(
    checkInModel as unknown as Model<TableCheckIn>,
    resultModel as unknown as Model<GameplayResult>,
    consumerService as unknown as ConsumerService,
    tableService as unknown as TableService,
    { sign } as never,
    { get: () => 'secret' } as never,
    gateway as unknown as AppWebSocketGateway,
  );
  return { service, gateway, sign };
}

const ali = { _id: 7, fullName: 'Ali Yılmaz', status: ConsumerStatus.ACTIVE };

describe('login', () => {
  it('doğru şifreyle müşteri token’ı verir', async () => {
    const password = await hash('gizli123', 4);
    const { service, sign } = build({
      consumerService: {
        findByEmailOrUserName: jest
          .fn()
          .mockResolvedValue({ ...ali, password }),
      },
    });
    const session = await service.login({
      identity: 'ali',
      password: 'gizli123',
    });
    expect(session.token).toBe('signed');
    expect(sign).toHaveBeenCalledWith(
      { type: 'consumer', consumer: 7 },
      { secret: 'secret', expiresIn: '30d' },
    );
  });

  it('yanlış şifreyi reddeder', async () => {
    const password = await hash('gizli123', 4);
    const { service } = build({
      consumerService: {
        findByEmailOrUserName: jest
          .fn()
          .mockResolvedValue({ ...ali, password }),
      },
    });
    await expect(
      service.login({ identity: 'ali', password: 'yanlis' }),
    ).rejects.toThrow('Invalid credentials');
  });

  // Panelden şifresiz eklenen müşteriler varsayılan şifreyle giremez.
  it('varsayılan şifreli hesabı açmaz', async () => {
    const password = await hash('default123', 4);
    const { service } = build({
      consumerService: {
        findByEmailOrUserName: jest
          .fn()
          .mockResolvedValue({ ...ali, password }),
      },
    });
    await expect(
      service.login({ identity: 'ali', password: 'default123' }),
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('register', () => {
  it('e-postayı küçük harfle kaydedip oturum açar', async () => {
    const create = jest.fn().mockResolvedValue(ali);
    const { service } = build({ consumerService: { create } });
    const session = await service.register({
      name: ' Ali ',
      surname: 'Yılmaz',
      userName: 'ali',
      email: 'Ali@Mail.com',
      password: 'gizli123',
    });
    expect(create).toHaveBeenCalledWith({
      name: 'Ali',
      surname: 'Yılmaz',
      userName: 'ali',
      email: 'ali@mail.com',
      password: 'gizli123',
      phone: undefined,
    });
    expect(session).toEqual({ token: 'signed', consumer: ali });
  });
});

describe('checkIn', () => {
  it('açık masa yoksa reddeder', async () => {
    const { service } = build({
      tableService: { findOpenByName: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.checkIn(ali as never, { location: 1, tableName: '5' }),
    ).rejects.toThrow('The table is not open');
  });

  it('ilk okutmada kaydeder ve masadakilere haber verir', async () => {
    const create = jest.fn().mockResolvedValue({});
    const checkInModel = {
      exists: jest.fn().mockResolvedValue(null),
      create,
      find: jest
        .fn()
        .mockReturnValue(query([{ consumer: 7 }, { consumer: 9 }])),
      findOne: jest.fn().mockReturnValue(query(null)),
    };
    const { service, gateway } = build({
      checkInModel,
      tableService: {
        findOpenByName: jest
          .fn()
          .mockResolvedValue({ _id: 30, location: 1, date: '2026-10-23' }),
      },
    });
    await service.checkIn(ali as never, { location: 1, tableName: '5' });
    expect(create).toHaveBeenCalledWith({
      consumer: 7,
      table: 30,
      location: 1,
      tableName: '5',
      date: '2026-10-23',
    });
    expect(gateway.emitConsumerTableChanged).toHaveBeenCalledWith([7, 9]);
  });

  it('aynı masada ikinci okutmada kayıt eklemez', async () => {
    const create = jest.fn();
    const { service, gateway } = build({
      checkInModel: {
        exists: jest.fn().mockResolvedValue({ _id: 1 }),
        create,
        findOne: jest.fn().mockReturnValue(query(null)),
      },
      tableService: {
        findOpenByName: jest.fn().mockResolvedValue({ _id: 30 }),
      },
    });
    await service.checkIn(ali as never, { location: 1, tableName: '5' });
    expect(create).not.toHaveBeenCalled();
    expect(gateway.emitConsumerTableChanged).not.toHaveBeenCalled();
  });
});

describe('saveResult', () => {
  const table = {
    _id: 30,
    location: 1,
    date: '2026-10-23',
    gameplays: [{ _id: 100, game: { _id: 5, name: 'Catan' } }],
  };
  const tableService = {
    findByGameplay: jest.fn().mockResolvedValue({ _id: 30 }),
    findByIdWithGameplays: jest.fn().mockResolvedValue(table),
  };
  const checkInModelAt = (consumers: number[]) => ({
    find: jest
      .fn()
      .mockReturnValueOnce(query(consumers.map((consumer) => ({ consumer }))))
      .mockReturnValue(
        query(
          consumers.map((consumer) => ({
            consumer: { _id: consumer, fullName: `Kişi ${consumer}` },
          })),
        ),
      ),
  });

  it('masaya okutmamış müşteriyi reddeder', async () => {
    const { service } = build({
      tableService,
      checkInModel: checkInModelAt([9]),
    });
    await expect(
      service.saveResult(ali as never, {
        gameplay: 100,
        players: [{ consumer: 7, name: 'Ali', isWinner: true }],
      }),
    ).rejects.toThrow('You did not check in at this table');
  });

  it('masada olmayan bir oyuncuyu reddeder', async () => {
    const { service } = build({
      tableService,
      checkInModel: checkInModelAt([7]),
    });
    await expect(
      service.saveResult(ali as never, {
        gameplay: 100,
        players: [
          { consumer: 7, name: 'Ali', isWinner: true },
          { consumer: 9, name: 'Ayşe', isWinner: false },
        ],
      }),
    ).rejects.toThrow('Players must have checked in at this table');
  });

  it('kaydeden oyunculardan biri olmalı', async () => {
    const { service } = build({
      tableService,
      checkInModel: checkInModelAt([7, 9]),
    });
    await expect(
      service.saveResult(ali as never, {
        gameplay: 100,
        players: [{ consumer: 9, name: 'Ayşe', isWinner: true }],
      }),
    ).rejects.toThrow('You must be one of the players');
  });

  it('sonucu uygulama kullanıcılarının kendi adlarıyla kaydeder', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 1 });
    const { service, gateway } = build({
      tableService,
      checkInModel: checkInModelAt([7, 9]),
      resultModel: { findOne: jest.fn().mockResolvedValue(null), create },
    });
    await service.saveResult(ali as never, {
      gameplay: 100,
      players: [
        { consumer: 7, name: 'x', score: 12, isWinner: true },
        { consumer: 9, name: 'y', score: 8, isWinner: false },
        { name: ' Misafir ', isWinner: false },
      ],
    });
    expect(create).toHaveBeenCalledWith({
      gameplay: 100,
      game: 5,
      table: 30,
      location: 1,
      date: '2026-10-23',
      players: [
        { consumer: 7, name: 'Kişi 7', score: 12, isWinner: true },
        { consumer: 9, name: 'Kişi 9', score: 8, isWinner: false },
        {
          consumer: undefined,
          name: 'Misafir',
          score: undefined,
          isWinner: false,
        },
      ],
      createdBy: 7,
    });
    expect(gateway.emitGameplayResultChanged).toHaveBeenCalledWith([7, 9]);
  });

  it('başkalarının sonucunu değiştirmeye izin vermez', async () => {
    const { service } = build({
      tableService,
      checkInModel: checkInModelAt([7, 9]),
      resultModel: {
        findOne: jest.fn().mockResolvedValue({
          players: [{ consumer: 9, name: 'Ayşe', isWinner: true }],
        }),
      },
    });
    await expect(
      service.saveResult(ali as never, {
        gameplay: 100,
        players: [{ consumer: 7, name: 'Ali', isWinner: true }],
      }),
    ).rejects.toThrow('Only its players can change a result');
  });
});
