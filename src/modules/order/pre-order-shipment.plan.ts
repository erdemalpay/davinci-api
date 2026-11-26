import { PickupFulfillmentOrder } from '../shopify/shopify.pickup-plan';
import { OrderStatus } from './order.dto';

const PRE_ORDER_SHIPMENT_TAG = 'on-siparis-gonderim';

export type ShippableCandidate = {
  _id: number;
  shopifyOrderId?: string;
  status?: string;
  isShipped?: boolean;
  isShopifyPickUp?: boolean;
  preOrderShipmentShopifyOrderId?: string;
};

export type ShipmentSkipReason =
  | 'NOT_SHOPIFY'
  | 'CANCELLED'
  | 'ALREADY_SHIPPED'
  | 'PICK_UP'
  | 'HAS_SHIPMENT';

export type ShipmentSkip = { orderId: number; reason: ShipmentSkipReason };

/** orders/fulfilled payload'ının bu işte okunan kısmı. */
export type ShipmentFulfilledPayload = {
  id?: number | string;
  fulfillments?: {
    tracking_number?: string | null;
    tracking_company?: string | null;
  }[];
};

export type ShipmentLine = { title: string; quantity: number };

export type ShipmentAddress = {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  provinceCode?: string;
  zip?: string;
  countryCode?: string;
  phone?: string;
};

/** Orijinal siparişten kopyaya taşınanlar. orderNumber "#" olmadan ("5580"). */
export type ShipmentSource = {
  orderNumber: string;
  customerId?: string;
  email?: string;
  shippingAddress?: ShipmentAddress;
};

type ZeroMoney = { shopMoney: { amount: string; currencyCode: string } };

export type PreOrderShipmentOrderInput = {
  currency: string;
  financialStatus: 'PAID';
  tags: string[];
  note: string;
  email?: string;
  customer?: { toAssociate: { id: string } };
  shippingAddress?: ShipmentAddress;
  lineItems: {
    title: string;
    quantity: number;
    priceSet: ZeroMoney;
    requiresShipping: boolean;
    taxable: boolean;
  }[];
  shippingLines: { title: string; priceSet: ZeroMoney }[];
};

export type ShipmentRecord = {
  /** Çıplak sayı; order.shopifyOrderLineItemId veritabanında öyle saklanıyor. */
  shopifyOrderLineItemId: string;
  quantity: number;
};

export type ShipmentFulfillmentInput = {
  fulfillmentOrderId: string;
  fulfillmentOrderLineItems: { id: string; quantity: number }[];
  /** Bu girdiyle kapanan orijinal satırlar; panel kaydını güncellemek için. */
  lineItemIds: string[];
};

export type ShipmentTracking = { number: string; company?: string };

const FULFILLABLE_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);

/** Panel kayıtlarını orijinal Shopify siparişine göre gruplar. */
export function groupByShopifyOrderId<T extends { shopifyOrderId?: string }>(
  orders: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const order of orders) {
    const group = groups.get(order.shopifyOrderId) ?? [];
    group.push(order);
    groups.set(order.shopifyOrderId, group);
  }
  return groups;
}

/**
 * Kopyaya girebilecek kayıtları orijinal Shopify siparişine göre gruplar.
 * #6803: iptal edilmiş kalem kopyaya girmez.
 */
export function selectShippableOrders<T extends ShippableCandidate>(
  orders: T[],
): { groups: Map<string, T[]>; skipped: ShipmentSkip[] } {
  const shippable: T[] = [];
  const skipped: ShipmentSkip[] = [];

  for (const order of orders) {
    let reason: ShipmentSkipReason | undefined;
    if (!order.shopifyOrderId) reason = 'NOT_SHOPIFY';
    else if (order.status === OrderStatus.CANCELLED) reason = 'CANCELLED';
    else if (order.isShipped) reason = 'ALREADY_SHIPPED';
    else if (order.isShopifyPickUp) reason = 'PICK_UP';
    else if (order.preOrderShipmentShopifyOrderId) reason = 'HAS_SHIPMENT';

    if (reason) skipped.push({ orderId: order._id, reason });
    else shippable.push(order);
  }

  return { groups: groupByShopifyOrderId(shippable), skipped };
}

/** "2x Flip7 Daha Acımasız" */
function formatShipmentLine(line: ShipmentLine): string {
  return line.quantity > 1 ? `${line.quantity}x ${line.title}` : line.title;
}

/**
 * Erdem'in Connector App ile açtığı kopyaların aynısı; tek fark notta ürünlerin
 * alt alta yazılması. Ürün satırı başlığı tek satır kalır.
 */
export function buildPreOrderShipmentInput(
  source: ShipmentSource,
  lines: ShipmentLine[],
): PreOrderShipmentOrderInput {
  const formattedLines = lines.map(formatShipmentLine);
  const zero: ZeroMoney = {
    shopMoney: { amount: '0.00', currencyCode: 'TRY' },
  };

  return {
    currency: 'TRY',
    financialStatus: 'PAID',
    tags: [PRE_ORDER_SHIPMENT_TAG],
    note: [
      `Ön sipariş gönderimi - orijinal sipariş #${source.orderNumber}`,
      ...formattedLines,
    ].join('\n'),
    // 13 Kasım: müşterisiz/e-postasız kopyayı Pax beyan edemedi.
    ...(source.email ? { email: source.email } : {}),
    ...(source.customerId
      ? { customer: { toAssociate: { id: source.customerId } } }
      : {}),
    ...(source.shippingAddress
      ? { shippingAddress: source.shippingAddress }
      : {}),
    lineItems: [
      {
        title: `Ön Sipariş - ${source.orderNumber} (${formattedLines.join(
          ' + ',
        )})`,
        quantity: 1,
        priceSet: zero,
        requiresShipping: true,
        taxable: false,
      },
    ],
    shippingLines: [{ title: 'Ücretsiz Kargo', priceSet: zero }],
  };
}

/**
 * Orijinalde yalnızca kopyada giden satırları kapatır. 17 Kasım'da siparişin
 * tamamı kapatılmış, henüz gelmemiş ön sipariş ürünleri de "gönderildi" olmuştu.
 */
export function planPreOrderShipmentFulfillment(
  records: ShipmentRecord[],
  fulfillmentOrders: PickupFulfillmentOrder[],
): ShipmentFulfillmentInput[] {
  const remaining = new Map<string, number>();
  for (const record of records) {
    remaining.set(
      record.shopifyOrderLineItemId,
      (remaining.get(record.shopifyOrderLineItemId) ?? 0) + record.quantity,
    );
  }

  const plan: ShipmentFulfillmentInput[] = [];
  for (const fulfillmentOrder of fulfillmentOrders) {
    if (!FULFILLABLE_STATUSES.has(fulfillmentOrder.status)) continue;

    const items: { id: string; quantity: number }[] = [];
    const lineItemIds: string[] = [];
    for (const line of fulfillmentOrder.lineItems) {
      const wanted = remaining.get(line.lineItemId) ?? 0;
      const quantity = Math.min(wanted, line.remainingQuantity);
      if (quantity <= 0) continue;
      items.push({ id: line.id, quantity });
      lineItemIds.push(line.lineItemId);
      remaining.set(line.lineItemId, wanted - quantity);
    }

    if (items.length > 0) {
      plan.push({
        fulfillmentOrderId: fulfillmentOrder.id,
        fulfillmentOrderLineItems: items,
        lineItemIds,
      });
    }
  }

  return plan;
}

/** orders/fulfilled payload'ı (production aboneliği): takip no son fulfillment'ta. */
export function extractShipmentTracking(
  data: ShipmentFulfilledPayload,
): ShipmentTracking | undefined {
  const fulfillments = Array.isArray(data?.fulfillments)
    ? data.fulfillments
    : [];
  for (let i = fulfillments.length - 1; i >= 0; i--) {
    const fulfillment = fulfillments[i];
    if (fulfillment?.tracking_number) {
      return {
        number: String(fulfillment.tracking_number),
        ...(fulfillment.tracking_company
          ? { company: fulfillment.tracking_company }
          : {}),
      };
    }
  }
  return undefined;
}
