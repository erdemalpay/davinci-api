import { roundPrice } from 'src/lib/marketplace';
import {
  IdefixShipment,
  IdefixShipmentItem,
  IdefixShipmentStatus,
} from './idefix.dto';

// Bu statülerdeki sevkiyatların kalemleri için sipariş oluşturulur. Kargo ve
// teslim de dahil: sunucu kapalıyken ilk statüler kaçırılmış olabilir.
export const IDEFIX_CREATE_STATUSES: IdefixShipmentStatus[] = [
  'created',
  'shipment_ready',
  'shipment_picking',
  'shipment_invoiced',
  'shipment_in_cargo',
  'shipment_delivered',
  'shipment_approved',
];

// shipment_split ve shipment_undeliver ikisine de girmez: bölmeyi biz
// yapmıyoruz, teslim edilemeyen gönderi ise iade akışıyla döner.
export const IDEFIX_CANCEL_STATUSES: IdefixShipmentStatus[] = [
  'shipment_cancelled',
  'shipment_unsupplied',
];

// Henüz kargoya verilmemiş sevkiyatlar; ayrılmış adet hesabında kullanılır.
export const IDEFIX_RESERVED_STATUSES: IdefixShipmentStatus[] = [
  'created',
  'shipment_ready',
  'shipment_picking',
  'shipment_invoiced',
];

export type IdefixShipmentPlan = {
  creates: Array<{ shipment: IdefixShipment; items: IdefixShipmentItem[] }>;
  cancelLineItemIds: string[];
};

// Tedarik edilemedi bildiriminde kalan kalemler yeni bir sevkiyata taşınır;
// aynı kalem aktif bir sevkiyatta da görünüyorsa iptal edilmez.
export function planShipmentActions(
  shipments: IdefixShipment[],
): IdefixShipmentPlan {
  const creates: IdefixShipmentPlan['creates'] = [];
  const activeIds = new Set<string>();
  const cancelIds = new Set<string>();

  for (const shipment of shipments) {
    const items = shipment.items ?? [];
    if (IDEFIX_CREATE_STATUSES.includes(shipment.status)) {
      items.forEach((item) => activeIds.add(String(item.id)));
      if (items.length > 0) creates.push({ shipment, items });
    } else if (IDEFIX_CANCEL_STATUSES.includes(shipment.status)) {
      items.forEach((item) => cancelIds.add(String(item.id)));
    }
  }

  return {
    creates,
    cancelLineItemIds: [...cancelIds].filter((id) => !activeIds.has(id)),
  };
}

// Mağazanın fatura edeceği tutar; platformun kendi indirimleri bizi etkilemez.
export function toUnitPrice(item: IdefixShipmentItem): number {
  for (const value of [item.vendorAmount, item.discountedTotalPrice]) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return roundPrice(amount);
  }
  return Number(item.price);
}

export function shipmentCreatedAt(shipment: IdefixShipment): Date {
  const date = new Date(shipment.orderDate ?? shipment.createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// idefix tarih filtreleri "2022/09/30 23:59:59" (İstanbul) biçiminde ister.
export function formatIdefixDate(date: Date): string {
  return date
    .toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' })
    .replace(/-/g, '/');
}
