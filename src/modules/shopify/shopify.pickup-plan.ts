export type PickupLine = {
  /** Çıplak sayı — order.shopifyOrderLineItemId veritabanında öyle saklanıyor. */
  shopifyOrderLineItemId: string;
  isBrought: boolean;
  isPreOrder: boolean;
};

export type PickupFulfillmentOrder = {
  id: string;
  status: string;
  methodType?: string;
  lineItems: {
    id: string;
    /** Çıplak sayı; PickupLine.shopifyOrderLineItemId ile eşleşir. */
    lineItemId: string;
    remainingQuantity: number;
  }[];
};

export type PickupReadyNoopReason =
  | 'NOTHING_BROUGHT'
  | 'WAITING_FOR_BRINGABLE'
  | 'NO_OPEN_PICKUP_FO';

export type PickupReadyAction =
  | {
      type: 'prepare';
      fulfillmentOrderId: string;
      expectedLineItemIds: string[];
    }
  | {
      type: 'split-and-prepare';
      fulfillmentOrderId: string;
      splitLineItems: { id: string; quantity: number }[];
      expectedLineItemIds: string[];
    };

export type PickupReadyPlan = {
  actions: PickupReadyAction[];
  noopReason?: PickupReadyNoopReason;
};

export type PickupFulfillNoopReason =
  | 'NO_FULFILLABLE_FO'
  | 'PARTIAL_PICKUP_NOT_SPLIT';

export type PickupFulfillPlan = {
  fulfillmentOrderIds: string[];
  noopReason?: PickupFulfillNoopReason;
};

export type PickupReadinessIO = {
  split(
    fulfillmentOrderId: string,
    lineItems: { id: string; quantity: number }[],
  ): Promise<void>;
  reload(): Promise<PickupFulfillmentOrder[]>;
  prepare(fulfillmentOrderId: string): Promise<void>;
};

const FULFILLABLE_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);

/**
 * getFulfillmentOrdersForOrder cevabını indirger. lineItemId çıplak sayıya
 * çevrilir; FO id'leri GID olarak kalır çünkü mutation'lar GID bekliyor.
 */
export function toPickupFulfillmentOrders(
  fulfillmentOrders: any[],
): PickupFulfillmentOrder[] {
  const bareId = (gid: any): string =>
    gid == null ? '' : String(gid).split('/').pop();

  return (fulfillmentOrders ?? []).map((fo) => ({
    id: fo.id,
    status: fo.status,
    methodType: fo.deliveryMethod?.methodType,
    lineItems: (fo.lineItems?.edges ?? []).map((edge: any) => ({
      id: edge.node.id,
      lineItemId: bareId(edge.node.lineItem?.id),
      remainingQuantity: edge.node.remainingQuantity ?? 0,
    })),
  }));
}

/**
 * Ön sipariş satırları beklemeyi engellemez — onlar gelmeden de elimizdekiler
 * teslime hazır edilir. İptal satırlar çağıran tarafta elenir.
 */
export function planPickupReadiness(
  lines: PickupLine[],
  fulfillmentOrders: PickupFulfillmentOrder[],
): PickupReadyPlan {
  if (lines.some((l) => !l.isBrought && !l.isPreOrder)) {
    return { actions: [], noopReason: 'WAITING_FOR_BRINGABLE' };
  }

  const broughtIds = new Set(
    lines.filter((l) => l.isBrought).map((l) => l.shopifyOrderLineItemId),
  );
  if (broughtIds.size === 0) {
    return { actions: [], noopReason: 'NOTHING_BROUGHT' };
  }

  const actions: PickupReadyAction[] = [];

  for (const fo of fulfillmentOrders) {
    if (fo.status !== 'OPEN' || fo.methodType !== 'PICK_UP') continue;

    const readyLines = fo.lineItems.filter((li) =>
      broughtIds.has(li.lineItemId),
    );
    if (readyLines.length === 0) continue;

    const expectedLineItemIds = readyLines.map((li) => li.lineItemId);

    // Shopify bir paketin tüm satırlarının bölünmesine izin vermiyor.
    if (readyLines.length === fo.lineItems.length) {
      actions.push({
        type: 'prepare',
        fulfillmentOrderId: fo.id,
        expectedLineItemIds,
      });
      continue;
    }

    actions.push({
      type: 'split-and-prepare',
      fulfillmentOrderId: fo.id,
      splitLineItems: readyLines.map((li) => ({
        id: li.id,
        quantity: li.remainingQuantity,
      })),
      expectedLineItemIds,
    });
  }

  return actions.length > 0
    ? { actions }
    : { actions: [], noopReason: 'NO_OPEN_PICKUP_FO' };
}

/**
 * fulfillmentOrderSplit cevabındaki `fulfillmentOrder` /
 * `remainingFulfillmentOrder` alan isimleri gerçekte olanın tersini ima ediyor.
 * Bu yüzden cevaba bakılmaz; paketler yeniden okunup içeriğe göre eşleştirilir.
 * Eşleşme yoksa hiçbir şey hazırlanmaz — yanlış pakete "hazır" demek müşteriye
 * hatalı mail gönderir.
 */
export async function executePickupReadiness(
  actions: PickupReadyAction[],
  io: PickupReadinessIO,
): Promise<string[]> {
  const prepared: string[] = [];

  for (const action of actions) {
    let targetId = action.fulfillmentOrderId;

    if (action.type === 'split-and-prepare') {
      await io.split(action.fulfillmentOrderId, action.splitLineItems);

      const expected = new Set(action.expectedLineItemIds);
      const match = (await io.reload()).find(
        (fo) =>
          fo.status === 'OPEN' &&
          fo.lineItems.length === expected.size &&
          fo.lineItems.every((li) => expected.has(li.lineItemId)),
      );

      if (!match) {
        throw new Error(
          `No fulfillment order matches [${action.expectedLineItemIds.join(
            ', ',
          )}] after split`,
        );
      }

      targetId = match.id;
    }

    await io.prepare(targetId);
    prepared.push(targetId);
  }

  return prepared;
}

/**
 * Bir paket ancak kalan tüm satırları teslim alınmışsa kapatılır.
 *
 * pickedLineItemIds'e yalnızca hem teslim alınmış hem depodan getirilmiş
 * satırlar verilmelidir: panelde "Teslim Edildi" grup bazında çalışıyor ve
 * getirilmemiş ön sipariş satırlarını da işaretliyor.
 */
export function planPickupFulfillment(
  pickedLineItemIds: string[],
  fulfillmentOrders: PickupFulfillmentOrder[],
): PickupFulfillPlan {
  const picked = new Set(pickedLineItemIds);

  const fulfillable = fulfillmentOrders.filter((fo) =>
    FULFILLABLE_STATUSES.has(fo.status),
  );
  const pickupOrders = fulfillable.filter((fo) => fo.methodType === 'PICK_UP');

  // Gel-al paketi yoksa eski davranış korunur, ama yalnızca tek aday varken.
  let candidates = pickupOrders;
  if (pickupOrders.length === 0) {
    candidates = fulfillable.length === 1 ? fulfillable : [];
  }

  const matched = candidates.filter((fo) => {
    const remaining = fo.lineItems.filter((li) => li.remainingQuantity > 0);
    return (
      remaining.length > 0 && remaining.every((li) => picked.has(li.lineItemId))
    );
  });

  if (matched.length > 0) {
    return { fulfillmentOrderIds: matched.map((fo) => fo.id) };
  }

  const overlaps = candidates.some((fo) =>
    fo.lineItems.some(
      (li) => li.remainingQuantity > 0 && picked.has(li.lineItemId),
    ),
  );

  return {
    fulfillmentOrderIds: [],
    noopReason: overlaps ? 'PARTIAL_PICKUP_NOT_SPLIT' : 'NO_FULFILLABLE_FO',
  };
}
