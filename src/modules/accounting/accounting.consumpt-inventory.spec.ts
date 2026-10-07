jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { InventoryBoxSource } from '../inventory/inventory.schema';
import { StockHistoryStatusEnum } from './accounting.dto';
import { AccountingService } from './accounting.service';

const user = { _id: 'mehmet' } as any;

describe('consumptStock', () => {
  const stock = { _id: 's1', product: 'catan', location: 1, quantity: 5 };
  const dto = { product: 'catan', location: 1, quantity: 2 };

  function build() {
    const service: any = new (AccountingService as any)();
    service.stockModel = {
      findOne: jest.fn().mockResolvedValue(stock),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ ...stock, quantity: 3 }),
    };
    service.notificationService = {
      findAllEventNotifications: jest.fn().mockResolvedValue([]),
    };
    service.websocketGateway = { emitStockChanged: jest.fn() };
    service.activityService = {
      addUpdateActivity: jest.fn().mockResolvedValue(undefined),
    };
    service.createProductStockHistory = jest
      .fn()
      .mockResolvedValue({ _id: 42 });
    service.createStock = jest.fn().mockResolvedValue({ _id: 'new' });
    service.updateShopifyStock = jest.fn().mockResolvedValue(undefined);
    service.updateTrendyolStock = jest.fn();
    service.updateHepsiburadaStock = jest.fn();
    return service;
  }

  it('geri-çağırma verilmezse davranış aynıdır', async () => {
    const service = build();
    expect(await service.consumptStock(user, dto)).toBe(stock);
    expect(service.stockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      's1',
      { $inc: { quantity: -2 } },
      { new: true },
    );
    expect(service.createProductStockHistory).toHaveBeenCalledWith(user, {
      user: 'mehmet',
      product: 'catan',
      location: 1,
      change: -2,
      status: StockHistoryStatusEnum.CONSUMPTION,
      currentAmount: 5,
    });
    expect(service.updateShopifyStock).toHaveBeenCalledWith('catan', 1, 3);
    expect(service.updateTrendyolStock).toHaveBeenCalledWith('catan', 1, 3);
    expect(service.updateHepsiburadaStock).toHaveBeenCalledWith('catan', 1, 3);
  });

  it("geri-çağırmaya oluşan geçmiş kaydının id'sini verir", async () => {
    const service = build();
    const onHistoryCreated = jest.fn();
    expect(await service.consumptStock(user, dto, onHistoryCreated)).toBe(
      stock,
    );
    expect(onHistoryCreated).toHaveBeenCalledTimes(1);
    expect(onHistoryCreated).toHaveBeenCalledWith(42);
  });

  it('stok kaydı yoksa geri-çağırma çağrılmaz', async () => {
    const service = build();
    service.stockModel.findOne.mockResolvedValue(null);
    const onHistoryCreated = jest.fn();
    expect(await service.consumptStock(user, dto, onHistoryCreated)).toEqual({
      _id: 'new',
    });
    expect(service.createStock).toHaveBeenCalledWith(user, {
      product: 'catan',
      location: 1,
      quantity: -2,
      status: StockHistoryStatusEnum.CONSUMPTION,
    });
    expect(onHistoryCreated).not.toHaveBeenCalled();
  });
});

describe('consumptStockWithInventory', () => {
  const dto = {
    product: 'catan',
    location: 1,
    quantity: 2,
    inventory: { location: 4, shortCode: 'CAT' },
  };
  const consumed = { _id: 's1', quantity: 5 };

  function build() {
    const service: any = new (AccountingService as any)();
    service.stockModel = { exists: jest.fn().mockResolvedValue({ _id: 's1' }) };
    service.inventoryService = {
      validateConsumption: jest.fn().mockResolvedValue({ _id: 7 }),
      createBoxes: jest.fn().mockResolvedValue(['CAT-1', 'CAT-2']),
    };
    service.consumptStock = jest.fn(async (_u: any, _d: any, cb: any) => {
      cb(42);
      return consumed;
    });
    service.updateProductStockHistory = jest.fn();
    service.logger = { error: jest.fn() };
    return service;
  }

  it('doğrulama hatasında stok düşmez', async () => {
    const service = build();
    service.inventoryService.validateConsumption.mockRejectedValue(
      new Error('bad'),
    );
    await expect(service.consumptStockWithInventory(user, dto)).rejects.toThrow(
      'bad',
    );
    expect(service.inventoryService.validateConsumption).toHaveBeenCalledWith({
      product: 'catan',
      location: 4,
      shortCode: 'CAT',
    });
    expect(service.consumptStock).not.toHaveBeenCalled();
    expect(service.inventoryService.createBoxes).not.toHaveBeenCalled();
  });

  it('o lokasyonda stok kaydı yoksa reddeder', async () => {
    const service = build();
    service.stockModel.exists.mockResolvedValue(null);
    await expect(service.consumptStockWithInventory(user, dto)).rejects.toThrow(
      'Stock record',
    );
    expect(service.stockModel.exists).toHaveBeenCalledWith({
      product: 'catan',
      location: 1,
    });
    expect(service.inventoryService.validateConsumption).not.toHaveBeenCalled();
    expect(service.consumptStock).not.toHaveBeenCalled();
  });

  it.each([1.5, 0, -1])('adet %p ise reddeder', async (quantity) => {
    const service = build();
    await expect(
      service.consumptStockWithInventory(user, { ...dto, quantity }),
    ).rejects.toThrow('Quantity');
    expect(service.stockModel.exists).not.toHaveBeenCalled();
    expect(service.consumptStock).not.toHaveBeenCalled();
  });

  it('başarıda tüketir ve kutuları geçmiş id ile bağlar', async () => {
    const service = build();
    expect(await service.consumptStockWithInventory(user, dto)).toBe(consumed);
    expect(service.consumptStock).toHaveBeenCalledWith(
      user,
      { product: 'catan', location: 1, quantity: 2 },
      expect.any(Function),
    );
    expect(service.inventoryService.createBoxes).toHaveBeenCalledWith(user, {
      game: 7,
      quantity: 2,
      location: 4,
      source: InventoryBoxSource.CONSUMPTION,
      shortCode: 'CAT',
      stockHistory: 42,
    });
    expect(service.updateProductStockHistory).not.toHaveBeenCalled();
  });

  it('gövdedeki status yok sayılır, statü her zaman CONSUMPTION kalır', async () => {
    const service = build();
    await service.consumptStockWithInventory(user, {
      ...dto,
      status: StockHistoryStatusEnum.LOSSPRODUCT,
    });
    expect(service.consumptStock).toHaveBeenCalledWith(
      user,
      { product: 'catan', location: 1, quantity: 2 },
      expect.any(Function),
    );
  });

  it('geçmiş id alınamazsa kutu üretmeden 500 döner', async () => {
    const service = build();
    service.consumptStock.mockResolvedValue(consumed);
    await expect(
      service.consumptStockWithInventory(user, dto),
    ).rejects.toMatchObject({ status: 500 });
    expect(service.inventoryService.createBoxes).not.toHaveBeenCalled();
  });

  it('kutu üretimi hata verirse tüketimi geri alır', async () => {
    const service = build();
    service.inventoryService.createBoxes.mockRejectedValue(new Error('boom'));
    await expect(service.consumptStockWithInventory(user, dto)).rejects.toThrow(
      'boom',
    );
    expect(service.updateProductStockHistory).toHaveBeenCalledWith(user, '42', {
      status: StockHistoryStatusEnum.CONSUMPTIONCANCEL,
    });
  });

  it('telafi de hata verirse loglar ve asıl hatayı fırlatır', async () => {
    const service = build();
    service.inventoryService.createBoxes.mockRejectedValue(new Error('boom'));
    const cancelError = new Error('cancel failed');
    service.updateProductStockHistory.mockRejectedValue(cancelError);
    await expect(service.consumptStockWithInventory(user, dto)).rejects.toThrow(
      'boom',
    );
    expect(service.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('42'),
      cancelError,
    );
  });
});

describe('updateProductStockHistory', () => {
  const history = {
    _id: 42,
    product: 'catan',
    location: 1,
    change: -2,
  };

  function build() {
    const service: any = new (AccountingService as any)();
    service.productStockHistoryModel = {
      findById: jest.fn().mockResolvedValue(history),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ ...history, note: 'x' }),
    };
    service.createStock = jest.fn().mockResolvedValue({ _id: 'new' });
    service.websocketGateway = {
      emitProductStockHistoryChanged: jest.fn(),
    };
    service.inventoryService = {
      handleConsumptionCancel: jest.fn().mockResolvedValue(undefined),
    };
    return service;
  }

  it('CONSUMPTIONCANCEL: stoğu geri yazar ve envanter iptalini (user, history._id) ile çağırır', async () => {
    const service = build();
    const result = await service.updateProductStockHistory(user, '42', {
      status: StockHistoryStatusEnum.CONSUMPTIONCANCEL,
    });
    expect(service.createStock).toHaveBeenCalledWith(user, {
      product: 'catan',
      location: 1,
      quantity: 2,
      status: StockHistoryStatusEnum.CONSUMPTIONCANCEL,
    });
    expect(
      service.inventoryService.handleConsumptionCancel,
    ).toHaveBeenCalledTimes(1);
    expect(
      service.inventoryService.handleConsumptionCancel.mock
        .invocationCallOrder[0],
    ).toBeLessThan(service.createStock.mock.invocationCallOrder[0]);
    expect(
      service.inventoryService.handleConsumptionCancel,
    ).toHaveBeenCalledWith(user, 42);
    expect(
      service.productStockHistoryModel.findByIdAndUpdate,
    ).not.toHaveBeenCalled();
    expect(result).toBe(history);
  });

  it.each([
    StockHistoryStatusEnum.LOSSPRODUCTCANCEL,
    StockHistoryStatusEnum.LOSSPRODUCT,
    StockHistoryStatusEnum.CONSUMPTION,
  ])('%s: createStock çağrılır, envanter iptali çağrılmaz', async (status) => {
    const service = build();
    await service.updateProductStockHistory(user, '42', { status });
    expect(service.createStock).toHaveBeenCalledWith(user, {
      product: 'catan',
      location: 1,
      quantity: 2,
      status,
    });
    expect(
      service.inventoryService.handleConsumptionCancel,
    ).not.toHaveBeenCalled();
  });

  it('durum dışı güncellemede kaydı günceller, stok ve envantere dokunmaz', async () => {
    const service = build();
    await service.updateProductStockHistory(user, '42', { note: 'x' });
    expect(
      service.productStockHistoryModel.findByIdAndUpdate,
    ).toHaveBeenCalledWith('42', { note: 'x' }, { new: true });
    expect(service.createStock).not.toHaveBeenCalled();
    expect(
      service.inventoryService.handleConsumptionCancel,
    ).not.toHaveBeenCalled();
  });
});

describe('findAllProductStockHistories', () => {
  function build(results: unknown[], withBoxes: number[] = []) {
    const service: any = new (AccountingService as any)();
    service.productStockHistoryModel = {
      aggregate: jest.fn().mockResolvedValue(results),
    };
    service.inventoryService = {
      findStockHistoryIdsWithBoxes: jest.fn().mockResolvedValue(withBoxes),
    };
    return service;
  }

  it('sayfadaki kayıtlara kutu üretip üretmediğini hasInventory ile ekler', async () => {
    const service = build(
      [{ data: [{ _id: 1 }, { _id: 2 }], totalNumber: 2, totalPages: 1 }],
      [2],
    );
    const result = await service.findAllProductStockHistories(1, 10, {});
    expect(
      service.inventoryService.findStockHistoryIdsWithBoxes,
    ).toHaveBeenCalledWith([1, 2]);
    expect(result).toEqual({
      data: [
        { _id: 1, hasInventory: false },
        { _id: 2, hasInventory: true },
      ],
      totalNumber: 2,
      totalPages: 1,
    });
  });

  it('sonuç boşsa envanter sorgusu yapılmaz', async () => {
    const service = build([]);
    const result = await service.findAllProductStockHistories(1, 10, {});
    expect(result.data).toEqual([]);
    expect(
      service.inventoryService.findStockHistoryIdsWithBoxes,
    ).not.toHaveBeenCalled();
  });
});
