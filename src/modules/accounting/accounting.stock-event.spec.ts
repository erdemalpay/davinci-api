jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';
import { StockHistoryStatusEnum } from './accounting.dto';

const user = { _id: 'mehmet' } as never;
const dto = {
  product: 'cola',
  location: 2,
  quantity: 4,
  status: StockHistoryStatusEnum.ORDERCANCEL,
};
const updatedStock = {
  _id: 'cola2',
  product: 'cola',
  location: 2,
  quantity: 105,
  revision: 8,
};

type CreateStock = AccountingService['createStock'];

describe('createStock stok olayı', () => {
  function build(existingStock: unknown) {
    const saved: unknown[] = [];
    const stockModel = Object.assign(
      jest.fn().mockImplementation((data: object) => {
        const doc = {
          ...data,
          save: jest.fn().mockImplementation(async () => saved.push(doc)),
        };
        return doc;
      }),
      {
        findById: jest.fn().mockResolvedValue(existingStock),
        findByIdAndUpdate: jest.fn().mockResolvedValue(updatedStock),
      },
    );
    const emitStockChanged = jest.fn();
    const warn = jest.fn();
    const updateTrendyolStock = jest.fn();
    const service = Object.assign(Object.create(AccountingService.prototype), {
      stockModel,
      logger: { warn },
      websocketGateway: { emitStockChanged },
      createProductStockHistory: jest.fn().mockResolvedValue({}),
      activityService: {
        addActivity: jest.fn().mockResolvedValue(undefined),
        addUpdateActivity: jest.fn().mockResolvedValue(undefined),
      },
      menuService: {
        updateProductVisibilityAfterStockChange: jest
          .fn()
          .mockResolvedValue(undefined),
      },
      notificationService: {
        findAllEventNotifications: jest.fn().mockResolvedValue([]),
      },
      notifyBackInStockSubscribers: jest.fn().mockResolvedValue(undefined),
      updateShopifyStock: jest.fn(),
      updateTrendyolStock,
      updateHepsiburadaStock: jest.fn(),
      updateN11Stock: jest.fn(),
      updateIdefixStock: jest.fn(),
    }) as { createStock: CreateStock };
    return {
      service,
      stockModel,
      emitStockChanged,
      saved,
      warn,
      updateTrendyolStock,
    };
  }

  it('var olan stokta revizyonu miktarla birlikte artırır ve kaydı gönderir', async () => {
    const { service, stockModel, emitStockChanged } = build({
      _id: 'cola2',
      quantity: 101,
    });

    await service.createStock(user, dto);

    expect(stockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cola2',
      { $inc: { quantity: 4, revision: 1 } },
      { new: true },
    );
    expect(emitStockChanged.mock.calls.length).toBeGreaterThan(0);
    emitStockChanged.mock.calls.forEach((args) =>
      expect(args).toEqual([[updatedStock]]),
    );
  });

  it('yeni stok kaydını olayla gönderir', async () => {
    const { service, emitStockChanged, saved } = build(null);

    await service.createStock(user, dto);

    expect(saved).toHaveLength(1);
    expect(emitStockChanged.mock.calls.length).toBeGreaterThan(0);
    emitStockChanged.mock.calls.forEach((args) =>
      expect(args).toEqual([[saved[0]]]),
    );
  });

  it('olay kapalıysa var olan stokta olay göndermez', async () => {
    const { service, emitStockChanged } = build({
      _id: 'cola2',
      quantity: 101,
    });

    await service.createStock(user, dto, false);

    expect(emitStockChanged).not.toHaveBeenCalled();
  });

  it('güncellenen stoğu döner', async () => {
    const { service } = build({ _id: 'cola2', quantity: 101 });

    await expect(service.createStock(user, dto)).resolves.toBe(updatedStock);
  });

  it('pazaryerine güncellemeden dönen miktarı gönderir, çakışma yoksa uyarı yazmaz', async () => {
    const { service, warn, updateTrendyolStock } = build({
      _id: 'cola2',
      quantity: 101,
    });

    await service.createStock(user, dto);

    expect(updateTrendyolStock).toHaveBeenCalledWith('cola', 2, 105);
    expect(warn).not.toHaveBeenCalled();
  });

  it('aynı anda başka bir hareket stoğu değiştirdiyse güncel miktarı gönderir ve uyarı yazar', async () => {
    // Okunan 90, +4 sonrası 94 beklenirken güncelleme 105 döndü: arada başka hareket var
    const { service, warn, updateTrendyolStock } = build({
      _id: 'cola2',
      quantity: 90,
    });

    await service.createStock(user, dto);

    expect(updateTrendyolStock).toHaveBeenCalledWith('cola', 2, 105);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('cola2');
  });
});
