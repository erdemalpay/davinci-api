import { roundPrice } from 'src/lib/marketplace';
import {
  AmazonOrder,
  AmazonOrderItem,
  AmazonOrderStatus,
  AmazonReturnRow,
} from './amazon.dto';

// Henüz ödemesi/stoğu kesinleşmemiş (PENDING) siparişler ve karşılanamayanlar
// (UNFULFILLABLE) açılmaz; sonradan bu statülere düşenler iptal edilmez.
export const AMAZON_CREATE_STATUSES: AmazonOrderStatus[] = [
  'UNSHIPPED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'INVOICE_UNCONFIRMED',
];

export const AMAZON_CANCEL_STATUSES: AmazonOrderStatus[] = ['CANCELLED'];

// Müşteri siparişleri 402-8542665-4617950 biçimindedir. S02-... gibi Amazon'un
// kendi çoklu kanal/depo çıkış siparişleri satış değildir.
const CUSTOMER_ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

export type AmazonOrderPlan = {
  creates: AmazonOrder[];
  cancelLineItemIds: string[];
};

// Yalnızca Amazon'un gönderdiği (FBA) siparişler Amazon stok konumundan düşer;
// satıcının kendi gönderdiği siparişler bu stoğu etkilemez.
export function planOrderActions(orders: AmazonOrder[]): AmazonOrderPlan {
  const creates: AmazonOrder[] = [];
  const cancelLineItemIds: string[] = [];

  for (const order of orders) {
    if (!CUSTOMER_ORDER_ID.test(order.orderId)) continue;
    if (order.fulfillment?.fulfilledBy !== 'AMAZON') continue;
    const status = order.fulfillment.fulfillmentStatus;
    const items = order.orderItems ?? [];
    if (status && AMAZON_CREATE_STATUSES.includes(status)) {
      if (items.length > 0) creates.push(order);
    } else if (status && AMAZON_CANCEL_STATUSES.includes(status)) {
      cancelLineItemIds.push(...items.map((item) => item.orderItemId));
    }
  }
  return { creates, cancelLineItemIds };
}

// Fiyat yoksa ya da geçersizse null; o kalem açılmaz.
export function toUnitPrice(item: AmazonOrderItem): number | null {
  const amount = Number(item.product?.price?.unitPrice?.amount);
  return Number.isFinite(amount) && amount > 0 ? roundPrice(amount) : null;
}

export function orderCreatedAt(order: AmazonOrder): Date {
  const date = new Date(order.createdTime);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// Rapor sekmeyle ayrılmış düz metindir; sütunlar başlık satırından bulunur.
export function parseReturnRows(report: string): AmazonReturnRow[] {
  const [header, ...lines] = report.split(/\r?\n/).filter(Boolean);
  if (!header) return [];
  const columns = header.split('\t').map((name) => name.trim());
  const index = (name: string) => columns.indexOf(name);
  const [date, order, sku, qty, disposition, reason, plate] = [
    'return-date',
    'order-id',
    'sku',
    'quantity',
    'detailed-disposition',
    'reason',
    'license-plate-number',
  ].map(index);

  const rows: AmazonReturnRow[] = [];
  for (const line of lines) {
    const cells = line.split('\t');
    const quantity = Number(cells[qty]);
    if (!cells[order] || !cells[sku] || !(quantity > 0)) continue;
    rows.push({
      returnDate: cells[date] ?? '',
      orderId: cells[order],
      sku: cells[sku],
      quantity,
      disposition: cells[disposition] ?? '',
      reason: cells[reason] ?? '',
      licensePlate: cells[plate] ?? '',
    });
  }
  return rows;
}

// Aynı iade tekrar işlenmesin: iade paketinin plaka kodu, yoksa tarihi ile.
export function returnKey(row: AmazonReturnRow): string {
  return [row.licensePlate || row.returnDate, row.orderId, row.sku].join(':');
}

// Yalnızca satılabilir iade yeniden satışa döner; diğerleri Kayıplar'a gider.
export function isSellableReturn(row: AmazonReturnRow): boolean {
  return row.disposition === 'SELLABLE';
}
