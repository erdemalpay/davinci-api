import {
  PickupFulfillmentOrder,
  PickupLine,
  planPickupFulfillment,
  planPickupReadiness,
} from './shopify.pickup-plan';

const line = (over: Partial<PickupLine> = {}): PickupLine => ({
  shopifyOrderLineItemId: '100',
  isBrought: false,
  isPreOrder: false,
  ...over,
});

/** Tek paket, verilen order line item id'lerini icerir. foLine id'si = lineItemId + '000' */
const fo = (
  id: string,
  lineItemIds: string[],
  over: Partial<PickupFulfillmentOrder> = {},
): PickupFulfillmentOrder => ({
  id,
  status: 'OPEN',
  methodType: 'PICK_UP',
  lineItems: lineItemIds.map((lid) => ({
    id: `${lid}000`,
    lineItemId: lid,
    remainingQuantity: 1,
  })),
  ...over,
});

describe('planPickupReadiness', () => {
  it('S1: hepsi getirildiyse bolmeden tum paketi hazirlar', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isBrought: true }),
        line({ shopifyOrderLineItemId: '200', isBrought: true }),
        line({ shopifyOrderLineItemId: '300', isBrought: true }),
      ],
      [fo('FO1', ['100', '200', '300'])],
    );

    expect(plan.actions).toEqual([
      {
        type: 'prepare',
        fulfillmentOrderId: 'FO1',
        expectedLineItemIds: ['100', '200', '300'],
      },
    ]);
  });

  it('S2: 2 on siparis 1 getirilmisse getirileni bolup hazirlar', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '200', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '300', isBrought: true }),
      ],
      [fo('FO1', ['100', '200', '300'])],
    );

    expect(plan.actions).toEqual([
      {
        type: 'split-and-prepare',
        fulfillmentOrderId: 'FO1',
        splitLineItems: [{ id: '300000', quantity: 1 }],
        expectedLineItemIds: ['300'],
      },
    ]);
  });

  it('S3: hicbiri getirilmediyse hicbir sey yapmaz', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '200' }),
      ],
      [fo('FO1', ['100', '200'])],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('WAITING_FOR_BRINGABLE');
  });

  it('S4: getirilebilir bir satir hala bekliyorsa hicbir sey yapmaz', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '200', isBrought: true }),
        line({ shopifyOrderLineItemId: '300', isBrought: false }),
      ],
      [fo('FO1', ['100', '200', '300'])],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('WAITING_FOR_BRINGABLE');
  });

  it('S5: tum satirlar on siparis ve hicbiri getirilmediyse hicbir sey yapmaz', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '200', isPreOrder: true }),
      ],
      [fo('FO1', ['100', '200'])],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('NOTHING_BROUGHT');
  });

  it('S6: on siparis sonradan gelince kalan paketi hazirlar', () => {
    const plan = planPickupReadiness(
      [
        line({
          shopifyOrderLineItemId: '100',
          isPreOrder: true,
          isBrought: true,
        }),
        line({
          shopifyOrderLineItemId: '200',
          isPreOrder: true,
          isBrought: true,
        }),
        line({ shopifyOrderLineItemId: '300', isBrought: true }),
      ],
      [
        fo('FO_KALAN', ['100', '200']),
        fo('FO_HAZIR', ['300'], { status: 'IN_PROGRESS' }),
      ],
    );

    expect(plan.actions).toEqual([
      {
        type: 'prepare',
        fulfillmentOrderId: 'FO_KALAN',
        expectedLineItemIds: ['100', '200'],
      },
    ]);
  });

  it('S7: acik paket kalmadiysa tekrar hazirlamaz (ikinci mail gitmez)', () => {
    const plan = planPickupReadiness(
      [line({ shopifyOrderLineItemId: '100', isBrought: true })],
      [fo('FO1', ['100'], { status: 'IN_PROGRESS' })],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('NO_OPEN_PICKUP_FO');
  });

  it('S8: gel-al olmayan teslimat yonteminde hicbir sey yapmaz', () => {
    const plan = planPickupReadiness(
      [line({ shopifyOrderLineItemId: '100', isBrought: true })],
      [fo('FO1', ['100'], { methodType: 'LOCAL' })],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('NO_OPEN_PICKUP_FO');
  });

  it('S10: kalan adet kadar boler', () => {
    const foWithQty: PickupFulfillmentOrder = {
      id: 'FO1',
      status: 'OPEN',
      methodType: 'PICK_UP',
      lineItems: [
        { id: '100000', lineItemId: '100', remainingQuantity: 2 },
        { id: '200000', lineItemId: '200', remainingQuantity: 1 },
      ],
    };

    const plan = planPickupReadiness(
      [
        line({
          shopifyOrderLineItemId: '100',
          isBrought: true,
        }),
        line({ shopifyOrderLineItemId: '200', isPreOrder: true }),
      ],
      [foWithQty],
    );

    expect(plan.actions).toEqual([
      {
        type: 'split-and-prepare',
        fulfillmentOrderId: 'FO1',
        splitLineItems: [{ id: '100000', quantity: 2 }],
        expectedLineItemIds: ['100'],
      },
    ]);
  });

  it('S11: getirilenler iki acik pakete yayilmissa her biri icin aksiyon uretir', () => {
    const plan = planPickupReadiness(
      [
        line({ shopifyOrderLineItemId: '100', isBrought: true }),
        line({ shopifyOrderLineItemId: '200', isPreOrder: true }),
        line({ shopifyOrderLineItemId: '300', isBrought: true }),
      ],
      [fo('FO_A', ['100', '200']), fo('FO_B', ['300'])],
    );

    expect(plan.actions).toEqual([
      {
        type: 'split-and-prepare',
        fulfillmentOrderId: 'FO_A',
        splitLineItems: [{ id: '100000', quantity: 1 }],
        expectedLineItemIds: ['100'],
      },
      {
        type: 'prepare',
        fulfillmentOrderId: 'FO_B',
        expectedLineItemIds: ['300'],
      },
    ]);
  });

  it('hic paket yoksa hicbir sey yapmaz', () => {
    const plan = planPickupReadiness(
      [line({ shopifyOrderLineItemId: '100', isBrought: true })],
      [],
    );

    expect(plan.actions).toEqual([]);
    expect(plan.noopReason).toBe('NO_OPEN_PICKUP_FO');
  });
});

describe('planPickupFulfillment', () => {
  it('T1: tek paket ve tum satirlar teslim alindiysa o paketi kapatir', () => {
    const plan = planPickupFulfillment(
      ['100', '200'],
      [fo('FO1', ['100', '200'])],
    );

    expect(plan.fulfillmentOrderIds).toEqual(['FO1']);
  });

  it('T2: iki paket varken sadece teslim alinan paketi kapatir', () => {
    const plan = planPickupFulfillment(
      ['300'],
      [
        fo('FO_ON_SIPARIS', ['100', '200']),
        fo('FO_HAZIR', ['300'], { status: 'IN_PROGRESS' }),
      ],
    );

    expect(plan.fulfillmentOrderIds).toEqual(['FO_HAZIR']);
  });

  it('T3: paket bolunmemisken kismi teslim kapatmaz', () => {
    const plan = planPickupFulfillment(
      ['300'],
      [fo('FO1', ['100', '200', '300'])],
    );

    expect(plan.fulfillmentOrderIds).toEqual([]);
    expect(plan.noopReason).toBe('PARTIAL_PICKUP_NOT_SPLIT');
  });

  it('T4: kapatilabilir paket yoksa hicbir sey yapmaz', () => {
    const plan = planPickupFulfillment(
      ['100'],
      [fo('FO1', ['100'], { status: 'CLOSED' })],
    );

    expect(plan.fulfillmentOrderIds).toEqual([]);
    expect(plan.noopReason).toBe('NO_FULFILLABLE_FO');
  });

  it('T5: PICK_UP paket yoksa tek fulfillable pakete geri duser', () => {
    const plan = planPickupFulfillment(
      ['100'],
      [fo('FO1', ['100'], { methodType: 'LOCAL' })],
    );

    expect(plan.fulfillmentOrderIds).toEqual(['FO1']);
  });

  it('PICK_UP paket yoksa ve birden fazla fulfillable paket varsa geri dusmez', () => {
    const plan = planPickupFulfillment(
      ['100', '200'],
      [
        fo('FO1', ['100'], { methodType: 'LOCAL' }),
        fo('FO2', ['200'], { methodType: 'SHIPPING' }),
      ],
    );

    expect(plan.fulfillmentOrderIds).toEqual([]);
    expect(plan.noopReason).toBe('NO_FULFILLABLE_FO');
  });

  it('kalan adedi 0 olan satirlar paketi engellemez', () => {
    const partiallyFulfilled: PickupFulfillmentOrder = {
      id: 'FO1',
      status: 'IN_PROGRESS',
      methodType: 'PICK_UP',
      lineItems: [
        { id: '100000', lineItemId: '100', remainingQuantity: 0 },
        { id: '200000', lineItemId: '200', remainingQuantity: 1 },
      ],
    };

    const plan = planPickupFulfillment(['200'], [partiallyFulfilled]);

    expect(plan.fulfillmentOrderIds).toEqual(['FO1']);
  });
});
