export const AMAZON_BASE_URL = 'https://sellingpartnerapi-eu.amazon.com';
export const AMAZON_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
// Amazon.com.tr
export const AMAZON_MARKETPLACE_ID = 'A33AVAJ2PDY3EV';
// Amazon her istekte user-agent ister.
export const AMAZON_USER_AGENT = 'davinci-be/1.0 (Language=TypeScript)';
// Amazon (FBA) stok konumu; online satış konumu (4) ayrıdır.
export const AMAZON_STOCK_LOCATION = 3;
// Kayıplar stok konumu; hasarlı/satılamaz iadeler buraya aktarılır.
export const AMAZON_LOST_STOCK_LOCATION = 8;
export const AMAZON_RETURNS_REPORT =
  'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA';

export type AmazonOrderStatus =
  | 'PENDING'
  | 'PENDING_AVAILABILITY'
  | 'UNSHIPPED'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'INVOICE_UNCONFIRMED'
  | 'UNFULFILLABLE'
  | 'CANCELLED';

export type AmazonOrderItem = {
  orderItemId: string;
  quantityOrdered: number;
  product?: {
    asin?: string;
    sellerSku?: string;
    title?: string;
    price?: { unitPrice?: { amount?: string; currencyCode?: string } };
  };
};

// Orders API v2026-01-01; fulfillment alanı includedData=FULFILLMENT ile gelir.
export type AmazonOrder = {
  orderId: string;
  createdTime: string;
  lastUpdatedTime: string;
  fulfillment?: {
    fulfilledBy?: 'AMAZON' | 'MERCHANT';
    fulfillmentStatus?: AmazonOrderStatus;
  };
  orderItems?: AmazonOrderItem[];
};

// Amazon sayfalı cevaplarda sonraki sayfa için nextToken verir.
export type AmazonPagination = { nextToken?: string };

export type AmazonOrdersPage = {
  orders?: AmazonOrder[];
  pagination?: AmazonPagination;
};

export type AmazonFbaSummary = {
  asin: string;
  sellerSku: string;
  productName?: string;
  totalQuantity?: number;
  inventoryDetails?: { fulfillableQuantity?: number };
};

export type AmazonFbaSummariesPage = {
  payload?: { inventorySummaries?: AmazonFbaSummary[] };
  pagination?: AmazonPagination;
};

export type AmazonCatalogPage = {
  items?: Array<{
    asin: string;
    identifiers?: Array<{
      identifiers?: Array<{ identifierType: string; identifier: string }>;
    }>;
  }>;
};

export type AmazonProduct = {
  sellerSku: string;
  asin: string;
  title?: string;
  barcode: string | null;
  quantity: number;
};

export type AmazonReportStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'FATAL'
  | 'CANCELLED';

export type AmazonReport = {
  reportId: string;
  processingStatus: AmazonReportStatus;
  reportDocumentId?: string;
};

export type AmazonReportDocument = {
  url: string;
  compressionAlgorithm?: 'GZIP';
};

// FBA müşteri iade raporunun bir satırı (depoya ulaşan her iade).
export type AmazonReturnRow = {
  returnDate: string;
  orderId: string;
  sku: string;
  quantity: number;
  // SELLABLE, DEFECTIVE, CUSTOMER_DAMAGED, CARRIER_DAMAGED ...
  disposition: string;
  reason: string;
  licensePlate: string;
};
