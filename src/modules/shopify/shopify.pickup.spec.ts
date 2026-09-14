import {
  PickupFulfillmentOrder,
  PickupReadinessIO,
  executePickupReadiness,
  planPickupFulfillment,
  planPickupReadiness,
  toPickupFulfillmentOrders,
} from './shopify.pickup-plan';
/**
 * Staging magazadan alinan GERCEK API cevaplari. Shopify cevap seklini
 * degistirirse ya da sorgudan bir alan duserse (ornegin remainingQuantity)
 * testler kirilir; elle uydurulmus veri bunu yakalayamaz.
 */
/** #1316 — 3 urunlu gel-al siparisi, henuz hicbir islem yapilmamis. */
export const ORDER_1316_FULFILLMENT_ORDERS = [
  {
    id: 'gid://shopify/FulfillmentOrder/8491777261846',
    status: 'OPEN',
    deliveryMethod: {
      methodType: 'PICK_UP',
    },
    lineItems: {
      edges: [
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18309038211350',
            remainingQuantity: 1,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18136913510678' },
          },
        },
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18309038244118',
            remainingQuantity: 1,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18136913543446' },
          },
        },
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18309038276886',
            remainingQuantity: 1,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18136913576214' },
          },
        },
      ],
    },
  },
];

/**
 * #1315 — bolunmus ve bir paketi teslim edilmis siparis.
 * Karakum + Azul Mini bekliyor (OPEN), Canvas teslim edilmis (CLOSED).
 */
export const ORDER_1315_SPLIT_FULFILLMENT_ORDERS = [
  {
    id: 'gid://shopify/FulfillmentOrder/8489362948374',
    status: 'OPEN',
    deliveryMethod: { methodType: 'PICK_UP' },
    lineItems: {
      edges: [
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18304670826774',
            remainingQuantity: 1,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18132608286998' },
          },
        },
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18304670859542',
            remainingQuantity: 1,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18132608319766' },
          },
        },
      ],
    },
  },
  {
    id: 'gid://shopify/FulfillmentOrder/8489365242134',
    status: 'CLOSED',
    deliveryMethod: { methodType: 'PICK_UP' },
    lineItems: {
      edges: [
        {
          node: {
            id: 'gid://shopify/FulfillmentOrderLineItem/18304670892310',
            remainingQuantity: 0,
            totalQuantity: 1,
            lineItem: { id: 'gid://shopify/LineItem/18132608352534' },
          },
        },
      ],
    },
  },
];

/** #1316 satirlarinin bizdeki karsiligi (ciplak line item id'leri). */
export const ORDER_1316_LINE_ITEM_IDS = {
  first: '18136913510678',
  second: '18136913543446',
  third: '18136913576214',
};

describe('toPickupFulfillmentOrders — gercek Shopify cevabiyla', () => {
  it('GID line item id sini ciplak sayiya cevirir', () => {
    const [fo] = toPickupFulfillmentOrders(ORDER_1316_FULFILLMENT_ORDERS);

    expect(fo.lineItems.map((li) => li.lineItemId)).toEqual([
      ORDER_1316_LINE_ITEM_IDS.first,
      ORDER_1316_LINE_ITEM_IDS.second,
      ORDER_1316_LINE_ITEM_IDS.third,
    ]);
  });

  it('FO id sini ve FO line item id sini GID olarak birakir (mutationlar GID bekliyor)', () => {
    const [fo] = toPickupFulfillmentOrders(ORDER_1316_FULFILLMENT_ORDERS);

    expect(fo.id).toBe('gid://shopify/FulfillmentOrder/8491777261846');
    expect(fo.lineItems[0].id).toBe(
      'gid://shopify/FulfillmentOrderLineItem/18309038211350',
    );
  });

  it('status ve teslimat yontemini okur', () => {
    const [fo] = toPickupFulfillmentOrders(ORDER_1316_FULFILLMENT_ORDERS);

    expect(fo.status).toBe('OPEN');
    expect(fo.methodType).toBe('PICK_UP');
  });

  it('remainingQuantity yi okur — sorgudan duserse bu test kirilir', () => {
    const [fo] = toPickupFulfillmentOrders(ORDER_1316_FULFILLMENT_ORDERS);

    expect(fo.lineItems.map((li) => li.remainingQuantity)).toEqual([1, 1, 1]);
  });

  it('bolunmus siparisin iki paketini de dogru cozer', () => {
    const fos = toPickupFulfillmentOrders(ORDER_1315_SPLIT_FULFILLMENT_ORDERS);

    expect(fos).toHaveLength(2);
    expect(fos[0].status).toBe('OPEN');
    expect(fos[0].lineItems).toHaveLength(2);
    expect(fos[1].status).toBe('CLOSED');
    expect(fos[1].lineItems[0].remainingQuantity).toBe(0);
  });

  it('bos girdide patlamaz', () => {
    expect(toPickupFulfillmentOrders([])).toEqual([]);
    expect(toPickupFulfillmentOrders(null as any)).toEqual([]);
  });
});

/**
 * Bellekte calisan sahte Shopify.
 *
 * Staging'de #1314 ve #1315 uzerinde GOZLEMLENEN semantigi taklit eder:
 *   - split: belirtilen satirlar YENI bir id'ye gider, ORIJINAL id
 *     belirtilmeyenleri tutar. (Mutation cevabinin alan isimleri bunun
 *     TERSINI ima ediyor — bilerek boyle kuruldu ki kod cevaba guvenirse
 *     testler kirilsin.)
 *   - prepare: OPEN -> IN_PROGRESS
 *   - fulfill: paketi CLOSED yapar, kalan adetleri sifirlar
 */
class FakeShopify {
  private nextId = 9000000000000;
  public readonly splitCalls: {
    fulfillmentOrderId: string;
    lineItems: { id: string; quantity: number }[];
  }[] = [];
  public readonly prepareCalls: string[] = [];

  constructor(private fos: PickupFulfillmentOrder[]) {}

  snapshot(): PickupFulfillmentOrder[] {
    return JSON.parse(JSON.stringify(this.fos));
  }

  find(id: string) {
    return this.fos.find((fo) => fo.id === id);
  }

  split(
    fulfillmentOrderId: string,
    lineItems: { id: string; quantity: number }[],
  ) {
    this.splitCalls.push({ fulfillmentOrderId, lineItems });

    const source = this.find(fulfillmentOrderId);
    if (!source) throw new Error(`FO ${fulfillmentOrderId} yok`);
    if (source.status !== 'OPEN') {
      throw new Error(`FO ${fulfillmentOrderId} OPEN degil, bolunemez`);
    }

    const movingIds = new Set(lineItems.map((li) => li.id));
    const moving = source.lineItems.filter((li) => movingIds.has(li.id));
    const staying = source.lineItems.filter((li) => !movingIds.has(li.id));

    if (moving.length === 0) {
      throw new Error('bolunecek satir bulunamadi');
    }
    // Shopify tek satirli / tamami secilmis bir paketi bolmeye izin vermiyor
    if (staying.length === 0) {
      throw new Error('paketin tamami bolunemez');
    }

    // Belirtilenler YENI id'ye gider
    const created: PickupFulfillmentOrder = {
      id: `gid://shopify/FulfillmentOrder/${this.nextId++}`,
      status: 'OPEN',
      methodType: source.methodType,
      lineItems: moving,
    };
    // Orijinal id kalanlari tutar
    source.lineItems = staying;
    this.fos.push(created);
  }

  prepare(fulfillmentOrderId: string) {
    this.prepareCalls.push(fulfillmentOrderId);

    const fo = this.find(fulfillmentOrderId);
    if (!fo) throw new Error(`FO ${fulfillmentOrderId} yok`);
    if (fo.status !== 'OPEN') {
      throw new Error(`FO ${fulfillmentOrderId} OPEN degil, hazirlanamaz`);
    }
    fo.status = 'IN_PROGRESS';
  }

  fulfill(fulfillmentOrderId: string) {
    const fo = this.find(fulfillmentOrderId);
    if (!fo) throw new Error(`FO ${fulfillmentOrderId} yok`);
    fo.status = 'CLOSED';
    fo.lineItems = fo.lineItems.map((li) => ({ ...li, remainingQuantity: 0 }));
  }

  io(): PickupReadinessIO {
    return {
      split: async (id, items) => this.split(id, items),
      reload: async () => this.snapshot(),
      prepare: async (id) => this.prepare(id),
    };
  }
}

const { first, second, third } = ORDER_1316_LINE_ITEM_IDS;

const line = (id: string, over: any = {}) => ({
  shopifyOrderLineItemId: id,
  isBrought: false,
  isPreOrder: false,
  ...over,
});

const freshStore = () =>
  new FakeShopify(toPickupFulfillmentOrders(ORDER_1316_FULFILLMENT_ORDERS));

/** Panelde "Depodan Getirildi" basildiginda olan seyin tamami. */
const runBrought = async (shopify: FakeShopify, lines: any[]) => {
  const plan = planPickupReadiness(lines, shopify.snapshot());
  const prepared = await executePickupReadiness(plan.actions, shopify.io());
  return { plan, prepared };
};

describe('sahte Shopify uzerinde uctan uca gel-al akisi', () => {
  it('S2: 2 on siparis + 1 getirilmis => SADECE getirilen urunun paketi hazirlanir', async () => {
    const shopify = freshStore();

    const { prepared } = await runBrought(shopify, [
      line(first, { isPreOrder: true }),
      line(second, { isPreOrder: true }),
      line(third, { isBrought: true }),
    ]);

    expect(prepared).toHaveLength(1);

    // ISIN OZU: hazirlanan paket TAM OLARAK getirilen urunu icermeli.
    const hazir = shopify.find(prepared[0]);
    expect(hazir.status).toBe('IN_PROGRESS');
    expect(hazir.lineItems.map((li) => li.lineItemId)).toEqual([third]);

    // On siparisler ayri pakette ve hala bekliyor
    const bekleyen = shopify
      .snapshot()
      .find((fo) => fo.status === 'OPEN' && fo.id !== prepared[0]);
    expect(bekleyen.lineItems.map((li) => li.lineItemId)).toEqual([
      first,
      second,
    ]);
  });

  it('S1 REGRESYON: hepsi getirilmisse HIC bolme yapilmaz', async () => {
    const shopify = freshStore();

    const { prepared } = await runBrought(shopify, [
      line(first, { isBrought: true }),
      line(second, { isBrought: true }),
      line(third, { isBrought: true }),
    ]);

    expect(shopify.splitCalls).toHaveLength(0);
    expect(shopify.prepareCalls).toHaveLength(1);
    expect(shopify.snapshot()).toHaveLength(1);
    expect(shopify.find(prepared[0]).status).toBe('IN_PROGRESS');
  });

  it('S7: ayni islem tekrar calisirsa ikinci kez hazirlamaz (mukerrer mail yok)', async () => {
    const shopify = freshStore();
    const lines = [
      line(first, { isPreOrder: true }),
      line(second, { isPreOrder: true }),
      line(third, { isBrought: true }),
    ];

    await runBrought(shopify, lines);
    const ilkTur = {
      split: shopify.splitCalls.length,
      prepare: shopify.prepareCalls.length,
    };

    const { plan } = await runBrought(shopify, lines);

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('NO_OPEN_PICKUP_FO');
    expect(shopify.splitCalls).toHaveLength(ilkTur.split);
    expect(shopify.prepareCalls).toHaveLength(ilkTur.prepare);
  });

  it('S6: on siparis sonradan gelince kalan paket hazirlanir', async () => {
    const shopify = freshStore();

    await runBrought(shopify, [
      line(first, { isPreOrder: true }),
      line(second, { isPreOrder: true }),
      line(third, { isBrought: true }),
    ]);

    const { prepared } = await runBrought(shopify, [
      line(first, { isPreOrder: true, isBrought: true }),
      line(second, { isPreOrder: true, isBrought: true }),
      line(third, { isBrought: true }),
    ]);

    expect(prepared).toHaveLength(1);
    const ikinciPaket = shopify.find(prepared[0]);
    expect(ikinciPaket.lineItems.map((li) => li.lineItemId)).toEqual([
      first,
      second,
    ]);
    // Artik acik paket kalmadi
    expect(shopify.snapshot().every((fo) => fo.status !== 'OPEN')).toBe(true);
  });

  it('T2: musteri sadece hazir paketi alirsa diger paket ACIK kalir', async () => {
    const shopify = freshStore();

    const { prepared } = await runBrought(shopify, [
      line(first, { isPreOrder: true }),
      line(second, { isPreOrder: true }),
      line(third, { isBrought: true }),
    ]);

    // Panel "Teslim Edildi" der; getirilmemis on siparisler listeye alinmaz
    const teslimPlan = planPickupFulfillment([third], shopify.snapshot());
    expect(teslimPlan.fulfillmentOrderIds).toEqual([prepared[0]]);

    teslimPlan.fulfillmentOrderIds.forEach((id) => shopify.fulfill(id));

    expect(shopify.find(prepared[0]).status).toBe('CLOSED');
    const kalan = shopify.snapshot().find((fo) => fo.status === 'OPEN');
    expect(kalan.lineItems.map((li) => li.lineItemId)).toEqual([first, second]);
  });

  /**
   * Bir siparisin icinde HEM stokta olan HEM on siparis urunu varsa ne oluyor?
   * S2 / T2 / S6 bu hikayenin parcalarini ayri ayri koruyor; burada hikayenin
   * TAMAMI tek testte kosuluyor — musteri iki kez gelip iki paketi de aliyor.
   *
   *   third        = Sky Team (stokta)
   *   first+second = Flip 7  (on siparis, haftalar sonra geliyor)
   */
  it('gel-al + on siparis: musteri iki kez gelir, iki paket de sirayla kapanir', async () => {
    const shopify = freshStore();

    // --- 1. GUN: Sky Team depoya geldi, personel o satira "Getirildi" basti.
    const gun1 = await runBrought(shopify, [
      line(first, { isPreOrder: true }),
      line(second, { isPreOrder: true }),
      line(third, { isBrought: true }),
    ]);
    const skyTeamPaketi = gun1.prepared[0];

    expect(gun1.prepared).toHaveLength(1);
    expect(shopify.find(skyTeamPaketi).lineItems.map((li) => li.lineItemId)) //
      .toEqual([third]);

    // --- 1. GUN: musteri geldi, Sky Team'i aldi. Flip 7 daha gelmedi.
    const teslim1 = planPickupFulfillment([third], shopify.snapshot());
    expect(teslim1.fulfillmentOrderIds).toEqual([skyTeamPaketi]);
    teslim1.fulfillmentOrderIds.forEach((id) => shopify.fulfill(id));

    // Sky Team paketi kapandi, Flip 7 paketi ACIK bekliyor.
    expect(shopify.find(skyTeamPaketi).status).toBe('CLOSED');
    const flip7Paketi = shopify.snapshot().find((fo) => fo.status === 'OPEN');
    expect(flip7Paketi.lineItems.map((li) => li.lineItemId)) //
      .toEqual([first, second]);

    // --- 2. GUN: Flip 7 depoya geldi, personel o satirlara "Getirildi" basti.
    const gun2 = await runBrought(shopify, [
      line(first, { isPreOrder: true, isBrought: true }),
      line(second, { isPreOrder: true, isBrought: true }),
      line(third, { isBrought: true }),
    ]);

    // Kapanmis Sky Team paketine TEKRAR dokunulmamali (mukerrer mail yok).
    expect(gun2.prepared).toEqual([flip7Paketi.id]);
    expect(shopify.find(skyTeamPaketi).status).toBe('CLOSED');

    // --- 2. GUN: musteri tekrar geldi, Flip 7'yi de aldi.
    const teslim2 = planPickupFulfillment(
      [first, second, third],
      shopify.snapshot(),
    );
    expect(teslim2.fulfillmentOrderIds).toEqual([flip7Paketi.id]);
    teslim2.fulfillmentOrderIds.forEach((id) => shopify.fulfill(id));

    // Siparisin tamami teslim edildi: acik paket kalmadi.
    expect(shopify.snapshot().every((fo) => fo.status === 'CLOSED')).toBe(true);
  });

  /**
   * #5956'nin on siparisli hali: Sky Team geldi ama personel "Getirildi"
   * basmadan dogruca "Teslim Edildi" dedi. Hicbir sey hazir degil.
   */
  it('gel-al + on siparis: hicbiri getirilmemisken teslim denirse HICBIR paket kapanmaz', async () => {
    const shopify = freshStore();

    const teslim = planPickupFulfillment([], shopify.snapshot());

    expect(teslim.fulfillmentOrderIds).toEqual([]);
    expect(shopify.snapshot().every((fo) => fo.status === 'OPEN')).toBe(true);
  });
});

describe('bolme sonrasi eslesme guvenligi', () => {
  it('beklenen icerikte paket bulunamazsa HICBIR SEY hazirlanmaz', async () => {
    const shopify = freshStore();
    const plan = planPickupReadiness(
      [
        line(first, { isPreOrder: true }),
        line(second, { isPreOrder: true }),
        line(third, { isBrought: true }),
      ],
      shopify.snapshot(),
    );

    // reload bozuk veri donuyor (Shopify gecikmesi / beklenmedik sekil)
    const bozukIO: PickupReadinessIO = {
      split: async (id, items) => shopify.split(id, items),
      reload: async () => [],
      prepare: async (id) => shopify.prepare(id),
    };

    await expect(executePickupReadiness(plan.actions, bozukIO)).rejects.toThrow(
      'after split',
    );

    // Kritik: hicbir hazirlama yapilmadi, yani musteriye mail gitmedi
    expect(shopify.prepareCalls).toHaveLength(0);
  });

  it('split cevabinin alan isimlerine guvenen kod bu testte KIRILIR', async () => {
    // Bu test #1314'te yasanan hatayi kilitler.
    // Gercek semantik: belirtilenler YENI id'ye gider, orijinal kalani tutar.
    const shopify = freshStore();
    const orijinalId = shopify.snapshot()[0].id;

    const plan = planPickupReadiness(
      [
        line(first, { isPreOrder: true }),
        line(second, { isPreOrder: true }),
        line(third, { isBrought: true }),
      ],
      shopify.snapshot(),
    );

    const prepared = await executePickupReadiness(plan.actions, shopify.io());

    // Hazirlanan paket ORIJINAL id OLMAMALI — orijinal id on siparisleri tutuyor
    expect(prepared[0]).not.toBe(orijinalId);
    expect(
      shopify.find(orijinalId).lineItems.map((li) => li.lineItemId),
    ).toEqual([first, second]);
  });
});
