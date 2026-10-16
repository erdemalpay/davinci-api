// Pazaryeri entegrasyonlarının (n11, idefix) ortak saf yardımcıları.

// Pazaryerleri fiyatı noktadan sonra 2 hane ister.
export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

// Pazaryeri fiyatı menünün online fiyatıdır; boşsa ürün fiyatına dokunulmaz.
export function hasOnlinePrice(value: unknown): value is number {
  return typeof value === 'number' && value > 0;
}

export function sumStockQuantity(stocks: Array<{ quantity?: number }>): number {
  return stocks.reduce((total, stock) => total + (stock.quantity || 0), 0);
}

// Barkod sayıya çevrilip baştaki sıfırlar düşmüş olabilir; önce birebir
// eşleşme (isExactMatch), bulunamazsa sıfırsız karşılaştırma yapılır.
export function findByBarcode<T extends { barcode?: string | null }>(
  items: T[],
  barcode: string,
  isExactMatch: (item: T) => boolean = (item) => item.barcode === barcode,
): T | undefined {
  const trimmed = barcode.replace(/^0+/, '');
  return (
    items.find(isExactMatch) ??
    items.find((item) => item.barcode?.replace(/^0+/, '') === trimmed)
  );
}
