import { InventoryService } from './inventory.service';

function build(models: Partial<Record<string, any>> = {}) {
  const gateway = { emitInventoryChanged: jest.fn() };
  const service = new (InventoryService as any)(
    models.box ?? {},
    models.movement ?? {},
    models.game ?? {},
    models.location ?? {},
    models.gameCode ?? {},
    gateway,
  ) as InventoryService;
  return { service, gateway };
}

const leanOf = (value: any) => ({ lean: jest.fn().mockResolvedValue(value) });
const user = { _id: 'mehmet' } as any;
const activeLocation = (id = 3) => ({
  findOne: jest.fn().mockReturnValue(leanOf({ _id: id, active: true })),
});

describe('allocateNumbers', () => {
  it('sayacı tek $inc ile artırır ve ayrılan aralığı döner', async () => {
    const gameCode = {
      findOneAndUpdate: jest.fn().mockReturnValue(leanOf({ seq: 7 })),
    };
    const { service } = build({ gameCode });
    expect(await service.allocateNumbers(1, 3)).toEqual([5, 6, 7]);
    expect(gameCode.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 1 },
      { $inc: { seq: 3 } },
      { new: true, projection: { seq: 1 } },
    );
  });

  it('kısaltma kaydı yoksa reddeder', async () => {
    const gameCode = {
      findOneAndUpdate: jest.fn().mockReturnValue(leanOf(null)),
    };
    const { service } = build({ gameCode });
    await expect(service.allocateNumbers(1, 1)).rejects.toThrow(
      'Short code not set',
    );
  });
});

describe('addBoxes', () => {
  it('pasif lokasyonda hiçbir şey yazmadan reddeder', async () => {
    const game = { exists: jest.fn() };
    const location = { findOne: jest.fn().mockReturnValue(leanOf(null)) };
    const { service } = build({ game, location });
    await expect(
      service.addBoxes(user, { game: 1, location: 3, quantity: 2 }),
    ).rejects.toThrow('Inventory location not found or inactive');
    expect(game.exists).not.toHaveBeenCalled();
  });

  it('MANUAL kaynaklı kutu üretir', async () => {
    const game = { exists: jest.fn().mockResolvedValue({ _id: 1 }) };
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf({ shortCode: 'CAT' })),
      findOneAndUpdate: jest.fn().mockReturnValue(leanOf({ seq: 1 })),
    };
    const box = { create: jest.fn(async (docs) => docs) };
    const movement = { create: jest.fn(async (docs) => docs) };
    const { service } = build({
      game,
      gameCode,
      box,
      movement,
      location: activeLocation(),
    });
    expect(
      await service.addBoxes(user, { game: 1, location: 3, quantity: 1 }),
    ).toEqual(['CAT-1']);
    expect(box.create.mock.calls[0][0][0].source).toBe('MANUAL');
  });
});

describe('createBoxes', () => {
  const input = {
    game: 1,
    quantity: 2,
    location: 3,
    source: 'CONSUMPTION' as any,
    shortCode: 'CAT',
    stockHistory: 9,
  };
  const game = () => ({ exists: jest.fn().mockResolvedValue({ _id: 1 }) });

  it('kısaltmayı bir kez kaydeder, kod = KISALTMA-SIRA üretir', async () => {
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf(null)),
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce(leanOf({ shortCode: 'CAT' }))
        .mockReturnValueOnce(leanOf({ seq: 2 })),
    };
    const box = { create: jest.fn(async (docs) => docs) };
    const movement = { create: jest.fn(async (docs) => docs) };
    const { service, gateway } = build({
      game: game(),
      gameCode,
      box,
      movement,
    });
    expect(await service.createBoxes(user, input)).toEqual(['CAT-1', 'CAT-2']);
    expect(gameCode.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: 1 },
      { $setOnInsert: { shortCode: 'CAT', seq: 0 } },
      { upsert: true, new: true },
    );
    expect(movement.create.mock.calls[0][0]).toHaveLength(2);
    expect(gateway.emitInventoryChanged).toHaveBeenCalled();
  });

  it('oyun yoksa reddeder', async () => {
    const { service } = build({
      game: { exists: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.createBoxes(user, input)).rejects.toThrow(
      'Game not found',
    );
  });

  it('oyunun kısaltması varsa ve farklı gönderilirse reddeder', async () => {
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf({ shortCode: 'CTN' })),
    };
    const { service } = build({ game: game(), gameCode });
    await expect(service.createBoxes(user, input)).rejects.toThrow('locked');
  });

  it('kısaltma başka bir oyunda kullanılıyorsa reddeder', async () => {
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf(null)),
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue({ code: 11000 }),
      }),
    };
    const { service } = build({ game: game(), gameCode });
    await expect(service.createBoxes(user, input)).rejects.toThrow(
      'already used',
    );
  });

  it('eşzamanlı istek başka kısaltma yazdıysa reddeder', async () => {
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(leanOf({ shortCode: 'CTN' })),
    };
    const { service } = build({ game: game(), gameCode });
    await expect(service.createBoxes(user, input)).rejects.toThrow('locked');
  });

  it('kısaltma string değilse yazmadan reddeder', async () => {
    const gameCode = {
      findOne: jest.fn().mockReturnValue(leanOf(null)),
      findOneAndUpdate: jest.fn(),
    };
    const { service } = build({ game: game(), gameCode });
    await expect(
      service.createBoxes(user, { ...input, shortCode: ['AB'] as any }),
    ).rejects.toThrow('2-5');
    expect(gameCode.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('lokasyonlar', () => {
  it('lokasyonları id sırasıyla lean döner', async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: 1 }]);
    const sort = jest.fn().mockReturnValue({ lean });
    const location = { find: jest.fn().mockReturnValue({ sort }) };
    const { service } = build({ location });
    expect(await service.findLocations()).toEqual([{ _id: 1 }]);
    expect(sort).toHaveBeenCalledWith({ _id: 1 });
  });

  it('lokasyonu aktif oluşturur ve emit eder', async () => {
    const location = { create: jest.fn(async (d) => d) };
    const { service, gateway } = build({ location });
    await service.createLocation({ name: 'Depo', note: 'x' });
    expect(location.create).toHaveBeenCalledWith({
      name: 'Depo',
      note: 'x',
      active: true,
    });
    expect(gateway.emitInventoryChanged).toHaveBeenCalled();
  });

  it('lokasyonu günceller ve emit eder', async () => {
    const location = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 5 }),
    };
    const { service, gateway } = build({ location });
    await service.updateLocation(5, { active: false });
    expect(location.findByIdAndUpdate).toHaveBeenCalledWith(
      5,
      { active: false },
      { new: true },
    );
    expect(gateway.emitInventoryChanged).toHaveBeenCalled();
  });
});

describe('findBoxes / findMovements', () => {
  it('yalnızca aktif kutuları, yeni önce listeler', async () => {
    const sort = jest.fn().mockReturnValue(leanOf([]));
    const box = { find: jest.fn().mockReturnValue({ sort }) };
    const { service } = build({ box });
    await service.findBoxes();
    expect(box.find).toHaveBeenCalledWith({ active: true });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('hareketleri en yeni önce, 1000 ile sınırlı listeler', async () => {
    const limit = jest.fn().mockReturnValue(leanOf([]));
    const sort = jest.fn().mockReturnValue({ limit });
    const movement = { find: jest.fn().mockReturnValue({ sort }) };
    const { service } = build({ movement });
    await service.findMovements();
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
    expect(limit).toHaveBeenCalledWith(1000);
  });
});

describe('findStockHistoryIdsWithBoxes', () => {
  it('verilen id lerden kutuya bağlı olanları (pasifler dahil) döner', async () => {
    const box = { distinct: jest.fn().mockResolvedValue([4, 9]) };
    const { service } = build({ box });
    expect(await service.findStockHistoryIdsWithBoxes([4, 5, 9])).toEqual([
      4, 9,
    ]);
    expect(box.distinct).toHaveBeenCalledWith('stockHistory', {
      stockHistory: { $in: [4, 5, 9] },
    });
  });
});

describe('moveBoxes', () => {
  it('hedef lokasyon pasifse reddeder', async () => {
    const location = {
      findOne: jest.fn().mockReturnValue(leanOf({ _id: 5, active: false })),
    };
    const box = { updateMany: jest.fn() };
    const { service } = build({ location, box });
    await expect(
      service.moveBoxes(user, { ids: ['CAT-1'], location: 5 }),
    ).rejects.toThrow('location not found');
    expect(box.updateMany).not.toHaveBeenCalled();
  });

  it('taşınacak aktif kutu yoksa reddeder', async () => {
    const box = {
      find: jest.fn().mockReturnValue(leanOf([])),
      updateMany: jest.fn(),
    };
    const { service } = build({ location: activeLocation(5), box });
    await expect(
      service.moveBoxes(user, { ids: ['CAT-1'], location: 5 }),
    ).rejects.toThrow('No active boxes');
    expect(box.find).toHaveBeenCalledWith({
      _id: { $in: ['CAT-1'] },
      active: true,
      location: { $ne: 5 },
    });
    expect(box.updateMany).not.toHaveBeenCalled();
  });

  it('yalnızca bulunan kutuları taşır ve hareket yazar', async () => {
    const box = {
      find: jest.fn().mockReturnValue(leanOf([{ _id: 'CAT-2', location: 3 }])),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const movement = { create: jest.fn(async (d) => d) };
    const { service, gateway } = build({
      location: activeLocation(5),
      box,
      movement,
    });
    expect(
      await service.moveBoxes(user, {
        ids: ['CAT-1', 'CAT-2'],
        location: 5,
        note: 'Turnuva',
      }),
    ).toEqual({ moved: 1 });
    expect(box.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['CAT-2'] }, active: true },
      { $set: { location: 5 } },
    );
    expect(movement.create.mock.calls[0][0]).toEqual([
      {
        box: 'CAT-2',
        type: 'MOVE',
        fromLocation: 3,
        toLocation: 5,
        note: 'Turnuva',
        user: 'mehmet',
      },
    ]);
    expect(gateway.emitInventoryChanged).toHaveBeenCalled();
  });
});

describe('deactivateBoxes', () => {
  it('aktif kutu yoksa reddeder', async () => {
    const box = {
      find: jest.fn().mockReturnValue(leanOf([])),
      updateMany: jest.fn(),
    };
    const { service } = build({ box });
    await expect(
      service.deactivateBoxes(user, { ids: ['CAT-1'] }),
    ).rejects.toThrow('No active boxes');
    expect(box.updateMany).not.toHaveBeenCalled();
  });

  it('pasife alır ve DEACTIVATE hareketi yazar', async () => {
    const box = {
      find: jest.fn().mockReturnValue(leanOf([{ _id: 'CAT-1', location: 3 }])),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const movement = { create: jest.fn(async (d) => d) };
    const { service, gateway } = build({ box, movement });
    expect(
      await service.deactivateBoxes(user, {
        ids: ['CAT-1', 'CAT-9'],
        note: 'Kayıp',
      }),
    ).toEqual({ deactivated: 1 });
    expect(box.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['CAT-1'] }, active: true },
      { $set: { active: false } },
    );
    expect(movement.create.mock.calls[0][0]).toEqual([
      {
        box: 'CAT-1',
        type: 'DEACTIVATE',
        fromLocation: 3,
        note: 'Kayıp',
        user: 'mehmet',
      },
    ]);
    expect(gateway.emitInventoryChanged).toHaveBeenCalled();
  });
});

describe('findLinkableGames', () => {
  it('yalnızca ürünü tek oyuna bağlı olanları, kısaltmasıyla döner', async () => {
    const game = {
      find: jest.fn().mockReturnValue(
        leanOf([
          { _id: 1, name: 'Catan', product: 'p1' },
          { _id: 2, name: 'Catan Plus', product: 'p1' }, // aynı ürüne 2 oyun
          { _id: 3, name: 'Carcassonne', product: 'p2' },
        ]),
      ),
    };
    const gameCode = {
      find: jest.fn().mockReturnValue(leanOf([{ _id: 3, shortCode: 'CAR' }])),
    };
    const { service } = build({ game, gameCode });
    expect(await service.findLinkableGames()).toEqual([
      { _id: 3, name: 'Carcassonne', product: 'p2', shortCode: 'CAR' },
    ]);
    expect(gameCode.find).toHaveBeenCalledWith({ _id: { $in: [3] } });
  });
});

describe('validateConsumption', () => {
  const input = { product: 'catan', location: 4, shortCode: 'CAT' };
  const games = (value: any[]) => ({
    find: jest.fn().mockReturnValue(leanOf(value)),
  });
  const codeOf = (shortCode?: string, exists: any = null) => ({
    findOne: jest
      .fn()
      .mockReturnValue(leanOf(shortCode ? { shortCode } : null)),
    exists: jest.fn().mockResolvedValue(exists),
  });

  it('ürüne bağlı tam bir oyun yoksa reddeder', async () => {
    const location = activeLocation(4);
    const { service } = build({
      game: games([{ _id: 1 }, { _id: 2 }]),
      location,
    });
    await expect(service.validateConsumption(input)).rejects.toThrow(
      'exactly one game',
    );
    expect(location.findOne).not.toHaveBeenCalled();
  });

  it('envanter lokasyonu pasifse reddeder', async () => {
    const location = {
      findOne: jest.fn().mockReturnValue(leanOf({ _id: 4, active: false })),
    };
    const { service } = build({ game: games([{ _id: 7 }]), location });
    await expect(service.validateConsumption(input)).rejects.toThrow(
      'location',
    );
  });

  it('kilitli kısaltmadan farklısı gönderilirse reddeder', async () => {
    const { service } = build({
      game: games([{ _id: 7 }]),
      location: activeLocation(4),
      gameCode: codeOf('CTN'),
    });
    await expect(service.validateConsumption(input)).rejects.toThrow('locked');
  });

  it('kısaltma yoksa biçimi denetler', async () => {
    const { service } = build({
      game: games([{ _id: 7 }]),
      location: activeLocation(4),
      gameCode: codeOf(),
    });
    await expect(
      service.validateConsumption({ ...input, shortCode: 'ca-t' }),
    ).rejects.toThrow('2-5');
  });

  it('kısaltma başka oyunda kullanılıyorsa reddeder', async () => {
    const gameCode = codeOf(undefined, { _id: 9 });
    const { service } = build({
      game: games([{ _id: 7 }]),
      location: activeLocation(4),
      gameCode,
    });
    await expect(service.validateConsumption(input)).rejects.toThrow(
      'already used',
    );
    expect(gameCode.exists).toHaveBeenCalledWith({ shortCode: 'CAT' });
  });

  it('geçerliyse oyunu döner ve hiçbir şey yazmaz', async () => {
    const gameCode = { ...codeOf('CAT'), findOneAndUpdate: jest.fn() };
    const { service } = build({
      game: games([{ _id: 7 }]),
      location: activeLocation(4),
      gameCode,
    });
    expect(await service.validateConsumption(input)).toEqual({ _id: 7 });
    expect(gameCode.exists).not.toHaveBeenCalled();
    expect(gameCode.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('handleConsumptionCancel', () => {
  it('tüketimin aktif kutularını pasife alır ve CANCEL hareketi yazar', async () => {
    const box = {
      find: jest.fn().mockReturnValue(
        leanOf([
          { _id: 'CAT-1', location: 3 },
          { _id: 'CAT-2', location: 5 },
        ]),
      ),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    };
    const movement = { create: jest.fn(async (d) => d) };
    const { service, gateway } = build({ box, movement });
    await service.handleConsumptionCancel(user, 42);
    expect(box.find).toHaveBeenCalledWith({ stockHistory: 42, active: true });
    expect(box.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['CAT-1', 'CAT-2'] }, active: true },
      { $set: { active: false } },
    );
    expect(movement.create).toHaveBeenCalledWith([
      { box: 'CAT-1', type: 'CANCEL', fromLocation: 3, user: 'mehmet' },
      { box: 'CAT-2', type: 'CANCEL', fromLocation: 5, user: 'mehmet' },
    ]);
    expect(gateway.emitInventoryChanged).toHaveBeenCalledTimes(1);
  });

  it('kutu yoksa hiçbir şey yazmaz ve emit etmez', async () => {
    const box = {
      find: jest.fn().mockReturnValue(leanOf([])),
      updateMany: jest.fn(),
    };
    const movement = { create: jest.fn() };
    const { service, gateway } = build({ box, movement });
    await service.handleConsumptionCancel(user, 1);
    expect(box.updateMany).not.toHaveBeenCalled();
    expect(movement.create).not.toHaveBeenCalled();
    expect(gateway.emitInventoryChanged).not.toHaveBeenCalled();
  });
});
