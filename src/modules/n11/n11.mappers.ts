import {
  N11ClaimReturn,
  N11OrderLine,
  N11PackageStatus,
  N11Product,
  N11ShipmentPackage,
} from './n11.dto';

// Bu statülerdeki paketlerin satırları için sipariş oluşturulur. Shipped ve
// Delivered de dahil: sunucu kapalıyken Created aşaması kaçırılmış olabilir.
export const N11_CREATE_PACKAGE_STATUSES: N11PackageStatus[] = [
  'Created',
  'Picking',
  'Shipped',
  'Delivered',
];

// Unpacked = bölünen eski paket; yerine gelen paketler yeni orderLineId taşır.
export const N11_CANCEL_PACKAGE_STATUSES: N11PackageStatus[] = [
  'Cancelled',
  'UnSupplied',
  'Unpacked',
];

export const N11_CANCEL_LINE_STATUSES = ['Cancelled', 'UnSupplied'];

// Henüz kargoya verilmemiş paketler; ayrılmış adet hesabında kullanılır.
export const N11_RESERVED_PACKAGE_STATUSES: N11PackageStatus[] = [
  'Created',
  'Picking',
];

export type N11PackagePlan = {
  creates: Array<{ pkg: N11ShipmentPackage; lines: N11OrderLine[] }>;
  cancelLineItemIds: string[];
};

export function planPackageActions(
  packages: N11ShipmentPackage[],
): N11PackagePlan {
  const creates: N11PackagePlan['creates'] = [];
  const cancelIds = new Set<string>();

  for (const pkg of packages) {
    const isPackageCancelled = N11_CANCEL_PACKAGE_STATUSES.includes(
      pkg.shipmentPackageStatus,
    );
    const isPackageActive = N11_CREATE_PACKAGE_STATUSES.includes(
      pkg.shipmentPackageStatus,
    );
    const createLines: N11OrderLine[] = [];

    for (const line of pkg.lines ?? []) {
      const isLineCancelled = N11_CANCEL_LINE_STATUSES.includes(
        line.orderItemLineItemStatusName,
      );
      if (isPackageCancelled || isLineCancelled) {
        cancelIds.add(String(line.orderLineId));
      } else if (isPackageActive) {
        createLines.push(line);
      }
    }

    if (createLines.length > 0) {
      creates.push({ pkg, lines: createLines });
    }
  }

  return { creates, cancelLineItemIds: [...cancelIds] };
}

// Mağazanın fatura edeceği birim tutar; n11'in kendi indirimleri bizi etkilemez.
export function toUnitPrice(line: N11OrderLine): number {
  const invoiceAmount = Number(line.sellerInvoiceAmount);
  if (
    Number.isFinite(invoiceAmount) &&
    invoiceAmount > 0 &&
    line.quantity > 0
  ) {
    return toN11Price(invoiceAmount / line.quantity);
  }
  return Number(line.price);
}

// n11 statü adlarını bazen başında boşlukla döndürüyor (" Shipped").
export function packageCreatedAt(pkg: N11ShipmentPackage): Date {
  const created = pkg.packageHistories?.find(
    (history) => history.status?.trim() === 'Created',
  );
  return created ? new Date(created.createdDate) : new Date();
}

// Barkod sayıya çevrilip baştaki sıfırlar düşmüş olabilir.
export function findN11ProductByBarcode(
  products: N11Product[],
  barcode: string,
): N11Product | undefined {
  const trimmed = barcode.replace(/^0+/, '');
  return (
    products.find((p) => p.barcode === barcode || p.stockCode === barcode) ??
    products.find((p) => p.barcode?.replace(/^0+/, '') === trimmed)
  );
}

// n11 fiyatları noktadan sonra 2 hane ister, aksi halde SKU FAIL olur.
export function toN11Price(value: number): number {
  return Math.round(value * 100) / 100;
}

// SOAP iade servisi tarihleri dd/mm/yyyy (İstanbul) ister.
export function formatN11Date(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/Istanbul' });
}

// XML'de tek eleman nesne, birden fazla eleman dizi olarak parse edilir.
export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function mapClaimReturn(raw: any): N11ClaimReturn {
  return {
    claimReturnId: String(raw.claimReturnId),
    status: String(raw.status),
    orderNumber: String(raw.orderNumber),
    productId: String(raw.productId),
    productName: raw.productName,
    quantity: Number(raw.quantity) || 1,
    returnReasonType: raw.returnReasonType,
  };
}
