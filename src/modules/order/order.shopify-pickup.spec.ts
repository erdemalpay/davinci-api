jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderService } from './order.service';

const SHOPIFY_ORDER_ID = '6611692093497';

type FakeOrder = {
  _id: number;
  item: any;
  quantity: number;
  status: string;
  shopifyOrderId?: string;
  shopifyOrderLineItemId?: string;
  isShopifyPickUp?: boolean;
  isShopifyPickUpOrderBrought?: boolean;
  isShopifyCustomerPicked?: boolean;
  shopifyFulfillmentId?: string;
};

const orderLine = (over: Partial<FakeOrder> = {}): FakeOrder => ({
  _id: 1,
  item: { _id: 10, isPreOrder: false },
  quantity: 1,
  status: 'paid',
  shopifyOrderId: SHOPIFY_ORDER_ID,
  shopifyOrderLineItemId: '100',
  isShopifyPickUp: true,
  ...over,
});

const buildService = (orders: FakeOrder[]) => {
  const updateManyCalls: { filter: any; update: any }[] = [];

  const orderModel = {
    // .find({...}).populate('item') zincirini taklit eder
    find: jest.fn(() => ({
      populate: jest.fn(async () => orders),
    })),
    findByIdAndUpdate: jest.fn(async (id: number, update: any) => {
      const found = orders.find((o) => o._id === id);
      if (!found) return null;
      Object.assign(found, update);
      return { ...found, toObject: () => found };
    }),
    updateMany: jest.fn(async (filter: any, update: any) => {
      updateManyCalls.push({ filter, update });
      return { modifiedCount: 0 };
    }),
  };

  const shopifyService = {
    markPickupOrderReadyForPickup: jest.fn(
      async (
        _shopifyOrderId: string,
        _lines: any[],
      ): Promise<{ prepared: string[]; noopReason?: string }> => ({
        prepared: ['gid://shopify/FulfillmentOrder/1'],
      }),
    ),
    cancelFulfillment: jest.fn(async (_fulfillmentId: string) => undefined),
    createFulfillmentForPickupOrder: jest.fn(
      async (
        _shopifyOrderId: string,
        _pickedLineItemIds: string[],
        _notifyCustomer?: boolean,
      ): Promise<any[]> => [{ id: 'gid://shopify/Fulfillment/1' }],
    ),
  };

  const websocketGateway = { emitOrderUpdated: jest.fn() };

  const service = new (OrderService as any)(
    undefined,
    undefined,
    orderModel,
    ...Array(9).fill(undefined),
    websocketGateway,
    ...Array(9).fill(undefined),
    shopifyService,
    undefined,
  );

  jest.spyOn((service as any).logger, 'log').mockImplementation(() => void 0);
  jest.spyOn((service as any).logger, 'error').mockImplementation(() => void 0);

  return { service, shopifyService, orderModel, websocketGateway, updateManyCalls };
};

describe('syncShopifyPickup — "Depodan Getirildi"', () => {
  it('on siparis bilgisini populate edilen menu urununden okur', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '100',
        item: { _id: 10, isPreOrder: true },
      }),
      orderLine({
        _id: 2,
        shopifyOrderLineItemId: '200',
        item: { _id: 20, isPreOrder: false },
        isShopifyPickUpOrderBrought: true,
      }),
    ]);

    await (service as any).syncShopifyPickup(SHOPIFY_ORDER_ID, 'brought');

    const [, lines] =
      shopifyService.markPickupOrderReadyForPickup.mock.calls[0];
    expect(lines).toEqual([
      expect.objectContaining({
        shopifyOrderLineItemId: '100',
        isPreOrder: true,
        isBrought: false,
      }),
      expect.objectContaining({
        shopifyOrderLineItemId: '200',
        isPreOrder: false,
        isBrought: true,
      }),
    ]);
  });

  it('iptal edilmis satirlari Shopifye hic gondermez', async () => {
    const { service, shopifyService } = buildService([
      orderLine({ _id: 1, shopifyOrderLineItemId: '100', status: 'cancelled' }),
      orderLine({
        _id: 2,
        shopifyOrderLineItemId: '200',
        isShopifyPickUpOrderBrought: true,
      }),
    ]);

    await (service as any).syncShopifyPickup(SHOPIFY_ORDER_ID, 'brought');

    const [, lines] =
      shopifyService.markPickupOrderReadyForPickup.mock.calls[0];
    expect(lines.map((l: any) => l.shopifyOrderLineItemId)).toEqual(['200']);
  });

  it('hazirlama basarili olunca uyari donmez', async () => {
    const { service } = buildService([
      orderLine({ _id: 1, isShopifyPickUpOrderBrought: true }),
    ]);

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'brought',
    );

    expect(warning).toBeUndefined();
  });

  it('beklenen bekleme durumlarinda kullaniciya uyari GOSTERMEZ', async () => {
    const { service, shopifyService } = buildService([
      orderLine({ _id: 1, isShopifyPickUpOrderBrought: true }),
    ]);
    shopifyService.markPickupOrderReadyForPickup.mockResolvedValue({
      prepared: [],
      noopReason: 'WAITING_FOR_BRINGABLE',
    } as any);

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'brought',
    );

    expect(warning).toBeUndefined();
  });

  it('beklenmedik atlamada SESSIZ KALMAZ, uyari doner', async () => {
    const { service, shopifyService } = buildService([
      orderLine({ _id: 1, isShopifyPickUpOrderBrought: true }),
    ]);
    shopifyService.markPickupOrderReadyForPickup.mockResolvedValue({
      prepared: [],
      noopReason: 'NO_OPEN_PICKUP_FO',
    } as any);

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'brought',
    );

    expect(warning).toBe('SHOPIFY_READY_FOR_PICKUP_SKIPPED');
  });

  it('Shopify hata verirse siparis guncellemesi patlamaz, uyari doner', async () => {
    const { service, shopifyService } = buildService([
      orderLine({ _id: 1, isShopifyPickUpOrderBrought: true }),
    ]);
    shopifyService.markPickupOrderReadyForPickup.mockRejectedValue(
      new Error('Shopify 500'),
    );

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'brought',
    );

    expect(warning).toBe('SHOPIFY_READY_FOR_PICKUP_FAILED');
  });
});

describe('syncShopifyPickup — "Teslim Edildi" (T6 korumasi)', () => {
  it('getirilmemis on siparis satirlarini teslim listesine ALMAZ', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '100',
        item: { _id: 10, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true, // panel grup butonu hepsini isaretledi
      }),
      orderLine({
        _id: 2,
        shopifyOrderLineItemId: '200',
        item: { _id: 20, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
      orderLine({
        _id: 3,
        shopifyOrderLineItemId: '300',
        isShopifyPickUpOrderBrought: true,
        isShopifyCustomerPicked: true,
      }),
    ]);

    await (service as any).syncShopifyPickup(SHOPIFY_ORDER_ID, 'picked');

    const [, pickedIds] =
      shopifyService.createFulfillmentForPickupOrder.mock.calls[0];
    expect(pickedIds).toEqual(['300']);
  });

  it('fulfillment id sini SADECE teslim edilen satirlara yazar', async () => {
    const { service, updateManyCalls } = buildService([
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '100',
        item: { _id: 10, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
      orderLine({
        _id: 2,
        shopifyOrderLineItemId: '300',
        isShopifyPickUpOrderBrought: true,
        isShopifyCustomerPicked: true,
      }),
    ]);

    await (service as any).syncShopifyPickup(SHOPIFY_ORDER_ID, 'picked');

    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0].filter.shopifyOrderLineItemId).toEqual({
      $in: ['300'],
    });
    // On siparis satiri filtreye girmemeli, yoksa onun "teslim edildi"
    // isaretini kaldirmak Canvas'in fulfillment'ini iptal ederdi
    expect(updateManyCalls[0].filter.isShopifyCustomerPicked).toBeUndefined();
  });

  it('teslim edilebilecek satir yoksa Shopifye hic gitmez', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
    ]);

    await (service as any).syncShopifyPickup(SHOPIFY_ORDER_ID, 'picked');

    expect(shopifyService.createFulfillmentForPickupOrder).not.toHaveBeenCalled();
  });

  it('paket kapatilamadiysa sessiz kalmaz', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        isShopifyPickUpOrderBrought: true,
        isShopifyCustomerPicked: true,
      }),
    ]);
    shopifyService.createFulfillmentForPickupOrder.mockResolvedValue([] as any);

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'picked',
    );

    expect(warning).toBe('SHOPIFY_FULFILLMENT_SKIPPED');
  });
});

describe('teslimi geri alma', () => {
  it('fulfillment id sini ayni fulfillmenti tasiyan TUM satirlardan siler', async () => {
    const orders = [
      orderLine({ _id: 1, shopifyOrderLineItemId: '100' }),
      orderLine({ _id: 2, shopifyOrderLineItemId: '200' }),
    ];
    orders.forEach((o: any) => {
      o.shopifyFulfillmentId = 'gid://shopify/Fulfillment/1';
      o.isShopifyCustomerPicked = true;
    });
    const { service, shopifyService, updateManyCalls } = buildService(orders);

    await service.simpleOrderUpdate({ _id: 'dv' }, 1, {
      isShopifyCustomerPicked: false,
    });

    expect(shopifyService.cancelFulfillment).toHaveBeenCalledTimes(1);
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0].filter).toEqual({
      shopifyFulfillmentId: 'gid://shopify/Fulfillment/1',
    });
  });
});

describe('simpleBulkOrderUpdate — yaris durumu duzeltmesi', () => {
  it('3 satir birden isaretlense bile Shopifye TEK KEZ gider', async () => {
    const orders = [
      orderLine({ _id: 1, shopifyOrderLineItemId: '100' }),
      orderLine({ _id: 2, shopifyOrderLineItemId: '200' }),
      orderLine({ _id: 3, shopifyOrderLineItemId: '300' }),
    ];
    const { service, shopifyService, websocketGateway } = buildService(orders);

    await service.simpleBulkOrderUpdate({ _id: 'dv' }, [1, 2, 3], {
      isShopifyPickUpOrderBrought: true,
    });

    expect(shopifyService.markPickupOrderReadyForPickup).toHaveBeenCalledTimes(
      1,
    );
    expect(websocketGateway.emitOrderUpdated).toHaveBeenCalledTimes(1);
  });

  it('uc satirin da veritabani guncellemesi yapilir', async () => {
    const orders = [
      orderLine({ _id: 1, shopifyOrderLineItemId: '100' }),
      orderLine({ _id: 2, shopifyOrderLineItemId: '200' }),
      orderLine({ _id: 3, shopifyOrderLineItemId: '300' }),
    ];
    const { service, orderModel } = buildService(orders);

    await service.simpleBulkOrderUpdate({ _id: 'dv' }, [1, 2, 3], {
      isShopifyPickUpOrderBrought: true,
    });

    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(3);
    expect(orders.every((o) => o.isShopifyPickUpOrderBrought)).toBe(true);
  });

  it('iki farkli Shopify siparisi karisirsa her biri icin ayri senkron calisir', async () => {
    const orders = [
      orderLine({ _id: 1, shopifyOrderId: 'A', shopifyOrderLineItemId: '100' }),
      orderLine({ _id: 2, shopifyOrderId: 'A', shopifyOrderLineItemId: '200' }),
      orderLine({ _id: 3, shopifyOrderId: 'B', shopifyOrderLineItemId: '300' }),
    ];
    const { service, shopifyService } = buildService(orders);

    await service.simpleBulkOrderUpdate({ _id: 'dv' }, [1, 2, 3], {
      isShopifyPickUpOrderBrought: true,
    });

    expect(shopifyService.markPickupOrderReadyForPickup).toHaveBeenCalledTimes(
      2,
    );
    const calledOrderIds =
      shopifyService.markPickupOrderReadyForPickup.mock.calls.map(
        (c: any[]) => c[0],
      );
    expect(calledOrderIds.sort()).toEqual(['A', 'B']);
  });

  it('Shopify uyarisini toplu cevaba iliştirir', async () => {
    const orders = [orderLine({ _id: 1, shopifyOrderLineItemId: '100' })];
    const { service, shopifyService } = buildService(orders);
    shopifyService.markPickupOrderReadyForPickup.mockResolvedValue({
      prepared: [],
      noopReason: 'NO_OPEN_PICKUP_FO',
    } as any);

    const result: any[] = await service.simpleBulkOrderUpdate(
      { _id: 'dv' },
      [1],
      { isShopifyPickUpOrderBrought: true },
    );

    expect(result[0].shopifyWarning).toBe('SHOPIFY_READY_FOR_PICKUP_SKIPPED');
  });

  it('uyari yoksa cevaba hicbir sey eklemez', async () => {
    const orders = [orderLine({ _id: 1, shopifyOrderLineItemId: '100' })];
    const { service } = buildService(orders);

    const result: any[] = await service.simpleBulkOrderUpdate(
      { _id: 'dv' },
      [1],
      { isShopifyPickUpOrderBrought: true },
    );

    expect(result[0].shopifyWarning).toBeUndefined();
  });

  it('gel-al ile ilgisi olmayan toplu guncelleme eski yolu kullanir', async () => {
    const orders = [orderLine({ _id: 1 })];
    const { service, shopifyService } = buildService(orders);

    await service.simpleBulkOrderUpdate({ _id: 'dv' }, [1], {
      isShipped: true,
    } as any);

    expect(shopifyService.markPickupOrderReadyForPickup).not.toHaveBeenCalled();
    expect(
      shopifyService.createFulfillmentForPickupOrder,
    ).not.toHaveBeenCalled();
  });
});

/**
 * #5956 (10 Eyl 2026): "Teslim Edildi" basildi, panel yesil toast gosterdi,
 * Shopify'da sipariş "teslime hazir"da kaldi. Prod logunda TEK BIR satir yok —
 * ne hata, ne noop. Sebep: getirilmemis satirlarda 'picked' kolu Shopify'a hic
 * gitmeden `return undefined` yapiyor, yani cagirana da uyari donmuyor.
 *
 * Shopify'a gitmemesi DOGRU (bkz. "teslim edilebilecek satir yoksa Shopifye hic
 * gitmez"). Yanlis olan, personelin bunu ogrenememesi. "paket kapatilamadiysa
 * sessiz kalmaz" testi ayni niyeti zaten koruyor ama sadece Shopify cagrilip bos
 * dondugu dal icin; bu blok cagrilmadan once donen dali kapatiyor.
 */
describe('syncShopifyPickup — "Teslim Edildi" sessiz kalmamali (#5956)', () => {
  it('hicbir satir getirilmemisken uyari doner', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '100',
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
    ]);

    const warning = await (service as any).syncShopifyPickup(
      SHOPIFY_ORDER_ID,
      'picked',
    );

    // Shopify'a gitmemesi dogru, degismemeli
    expect(shopifyService.createFulfillmentForPickupOrder).not.toHaveBeenCalled();
    // ...ama cagiran taraf bunu bilmeli
    expect(warning).toBe('SHOPIFY_FULFILLMENT_SKIPPED');
  });

  it('panele donen toplu cevaba uyariyi ilistirir', async () => {
    const orders = [
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '100',
        isShopifyPickUpOrderBrought: false,
      }),
    ];
    const { service } = buildService(orders);

    const result: any[] = await service.simpleBulkOrderUpdate({ _id: 'dv' }, [1], {
      isShopifyCustomerPicked: true,
    });

    // Panel bugun bunu goremedigi icin yesil "teslim edildi" toast'u gosteriyor
    expect(result[0].shopifyWarning).toBe('SHOPIFY_FULFILLMENT_SKIPPED');
  });
});

/**
 * #1322 / #1323 (11 Eyl 2026, staging): gel-al siparisinde Karakum on siparis,
 * Canvas stokta. Personel once Canvas'a "Getirildi", sonra gruba "Teslim Edildi"
 * basti. Panel grup butonu Karakum'u da picked=true yapti (yalan kayit) ama
 * Shopify'a dogru sekilde SADECE Canvas gitti.
 *
 * Haftalar sonra Karakum depoya geldi, personel o satira "Getirildi" basti.
 * BEKLENEN: Karakum'un paketi de kapansin — cunku o satir zaten teslim edildi
 * isaretli ve panelde tik DOLU, personelin basacagi baska dugme yok.
 * OLAN: hicbir sey olmuyor. Paket Shopify'da "teslime hazir"da kaliyor,
 * siparis sonsuza kadar takili. Kurtarmanin tek yolu tiki kaldirip tekrar basmak.
 *
 * Bu test GECERSE parca 2 (yakinsama) calisiyor demektir.
 */
describe('gec gelen "Getirildi" takilan siparisi kurtarmali (#1322)', () => {
  const CANVAS = '100';
  const KARAKUM = '200';

  const takiliSiparis = () => [
    orderLine({
      _id: 1,
      shopifyOrderLineItemId: CANVAS,
      item: { _id: 10, isPreOrder: false },
      isShopifyPickUpOrderBrought: true,
      isShopifyCustomerPicked: true,
      // Canvas 1. gun teslim edildi; paketi kapali, tekrar kapatilmamali.
      shopifyFulfillmentId: 'gid://shopify/Fulfillment/1',
    }),
    orderLine({
      _id: 2,
      shopifyOrderLineItemId: KARAKUM,
      item: { _id: 20, isPreOrder: true },
      isShopifyPickUpOrderBrought: false,
      isShopifyCustomerPicked: true,
    }),
  ];

  it('on siparis gec gelince paketi kapatir', async () => {
    const orders = takiliSiparis();
    const { service, shopifyService } = buildService(orders);

    // Personel Karakum satirina "Depodan Getirildi" basiyor.
    await service.simpleOrderUpdate({ _id: 'dv' } as any, 2, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    // Once paket hazir edilmeli...
    expect(shopifyService.markPickupOrderReadyForPickup).toHaveBeenCalled();

    // ...ve satir zaten teslim edildi isaretli oldugu icin KAPATILMALI da.
    expect(shopifyService.createFulfillmentForPickupOrder).toHaveBeenCalledWith(
      SHOPIFY_ORDER_ID,
      [KARAKUM],
      false,
    );
  });

  it('teslim edildi isaretli DEGILSE paketi kapatmaz (musteri daha gelmedi)', async () => {
    const orders = takiliSiparis();
    orders[1].isShopifyCustomerPicked = false;
    const { service, shopifyService } = buildService(orders);

    await service.simpleOrderUpdate({ _id: 'dv' } as any, 2, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    expect(shopifyService.markPickupOrderReadyForPickup).toHaveBeenCalled();
    expect(
      shopifyService.createFulfillmentForPickupOrder,
    ).not.toHaveBeenCalled();
  });
});

/**
 * PROD VERISINDEN TURETILEN SENARYOLAR (davinci-prod, 11 Eyl 2026).
 * 280 gel-al siparisi tarandi. Sekiller:
 *   166 tek satir / on siparis yok      91 cok satir / on siparis yok
 *    11 tek satir / hepsi on siparis     6 cok satir / hepsi on siparis
 *     6 cok satir / KARISIK (on siparis + stokta)
 * Teslim edildi denmis ama Shopify paketi kapanmamis 3 siparis: #4576 #5514 #5606.
 * Asagidaki testler bu uc siparisin GERCEK satir dizilimini kullanir.
 */
describe('prod sekilleri — takilan siparisler yakinsamayla kurtulur', () => {
  /** #5514 (27 Agu): 5 satir, hepsi stokta, hepsi getirildi+teslim, ff YOK. */
  it('#5514: tum satirlar getirildi+teslim ama ff yoksa tek pakette kapatir', async () => {
    const ids = ['501', '502', '503', '504', '505'];
    const { service, shopifyService } = buildService(
      ids.map((li, i) =>
        orderLine({
          _id: i + 1,
          shopifyOrderLineItemId: li,
          item: { _id: 100 + i, isPreOrder: false },
          isShopifyPickUpOrderBrought: true,
          isShopifyCustomerPicked: true,
        }),
      ),
    );

    // Personel satirlardan birine tekrar "Depodan Getirildi" basiyor.
    await service.simpleOrderUpdate({ _id: 'dv' } as any, 1, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    expect(shopifyService.createFulfillmentForPickupOrder).toHaveBeenCalledWith(
      SHOPIFY_ORDER_ID,
      ids,
      false,
    );
  });

  /**
   * #5606 (30 Agu): 4 on siparis (getirilmemis) + 3 stokta (getirilmis),
   * hepsi teslim isaretli, hicbirinde ff yok.
   */
  const siparis5606 = () => [
    ...['601', '602', '603', '604'].map((li, i) =>
      orderLine({
        _id: i + 1,
        shopifyOrderLineItemId: li,
        item: { _id: 200 + i, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
    ),
    ...['605', '606', '607'].map((li, i) =>
      orderLine({
        _id: 5 + i,
        shopifyOrderLineItemId: li,
        item: { _id: 300 + i, isPreOrder: false },
        isShopifyPickUpOrderBrought: true,
        isShopifyCustomerPicked: true,
      }),
    ),
  ];

  it('#5606: bir on siparis gelince o satir ve takili stok satirlari kapanir, gelmeyenler ALINMAZ', async () => {
    const orders = siparis5606();
    const { service, shopifyService } = buildService(orders);

    // "dnup" (601) depoya geldi, personel o satira "Getirildi" basti.
    await service.simpleOrderUpdate({ _id: 'dv' } as any, 1, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    const [, gonderilen] =
      shopifyService.createFulfillmentForPickupOrder.mock.calls[0];

    // Gelen on siparis + zaten takili duran 3 stok satiri kapanir.
    expect(gonderilen).toEqual(['601', '605', '606', '607']);
    // Hala depoda olmayan 3 on siparis listeye GIRMEZ.
    expect(gonderilen).not.toContain('602');
    expect(gonderilen).not.toContain('603');
    expect(gonderilen).not.toContain('604');
  });

  /**
   * #4706 (1 Agu): 5 stok satiri getirilmis, 1 on siparis bekliyor,
   * musteri HENUZ GELMEDI (hicbiri teslim isaretli degil).
   * Yakinsama burada calismamali — yoksa musteri gelmeden siparis kapanir.
   */
  it('#4706: musteri gelmediyse getirildi paketi KAPATMAZ', async () => {
    const { service, shopifyService } = buildService([
      ...['701', '702', '703', '704', '705'].map((li, i) =>
        orderLine({
          _id: i + 1,
          shopifyOrderLineItemId: li,
          item: { _id: 400 + i, isPreOrder: false },
          isShopifyPickUpOrderBrought: true,
          isShopifyCustomerPicked: false,
        }),
      ),
      orderLine({
        _id: 6,
        shopifyOrderLineItemId: '706',
        item: { _id: 500, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: false,
      }),
    ]);

    await service.simpleOrderUpdate({ _id: 'dv' } as any, 1, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    expect(shopifyService.markPickupOrderReadyForPickup).toHaveBeenCalled();
    expect(
      shopifyService.createFulfillmentForPickupOrder,
    ).not.toHaveBeenCalled();
  });

  /** Zaten kapatilmis satirlar (ff dolu) tekrar Shopifye gonderilmemeli. */
  it('kapali paketi tekrar kapatmaya calismaz', async () => {
    const { service, shopifyService } = buildService([
      orderLine({
        _id: 1,
        shopifyOrderLineItemId: '801',
        isShopifyPickUpOrderBrought: true,
        isShopifyCustomerPicked: true,
        shopifyFulfillmentId: 'gid://shopify/Fulfillment/9',
      }),
      orderLine({
        _id: 2,
        shopifyOrderLineItemId: '802',
        item: { _id: 20, isPreOrder: true },
        isShopifyPickUpOrderBrought: false,
        isShopifyCustomerPicked: true,
      }),
    ]);

    await service.simpleOrderUpdate({ _id: 'dv' } as any, 2, {
      isShopifyPickUpOrderBrought: true,
    } as any);

    expect(shopifyService.createFulfillmentForPickupOrder).toHaveBeenCalledWith(
      SHOPIFY_ORDER_ID,
      ['802'],
      false,
    );
  });
});
