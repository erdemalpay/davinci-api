import { IsNumber, IsString, Min } from 'class-validator';

export const IDEFIX_BASE_URL = 'https://merchantapi.idefix.com';
// Satıcı ID'si gizli değil; tüm pim/oms yollarında path parametresi olarak geçer.
export const IDEFIX_VENDOR_ID = 28163;

export type IdefixInventoryItem = {
  barcode: string;
  stockCode: string;
  price: number;
  comparePrice: number;
  inventoryQuantity: number;
  isZoneSale?: boolean;
  active?: boolean;
};

// idefix fiyatı ve stoğu aynı istekte ister; ikisi de her zaman gönderilir.
export type IdefixInventoryUpdate = {
  barcode: string;
  price: number;
  comparePrice: number;
  inventoryQuantity: number;
};

export type IdefixBatchStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type IdefixInventoryBatch = {
  items: Array<
    IdefixInventoryUpdate & {
      status: 'created' | 'completed' | 'decline';
      failureReasons: string | null;
    }
  >;
  status: IdefixBatchStatus;
  batchRequestId: string;
  createdAt: string;
  completedAt: string | null;
};

export type IdefixShipmentStatus =
  | 'created'
  | 'shipment_ready'
  | 'shipment_picking'
  | 'shipment_invoiced'
  | 'shipment_cancelled'
  | 'shipment_unsupplied'
  | 'shipment_split'
  | 'shipment_in_cargo'
  | 'shipment_delivered'
  | 'shipment_undeliver'
  | 'shipment_approved';

// Liste her kalemi 1 adet döndürür (quantity alanı yok); id sipariş satırıdır.
export type IdefixShipmentItem = {
  id: number;
  barcode: string;
  productName: string;
  price: number;
  discountedTotalPrice: number;
  vendorAmount?: number;
  itemStatus?: string;
};

export type IdefixShipment = {
  // Sevkiyat numarası; orderNumber ana sipariş numarasıdır.
  id: number;
  orderNumber: string;
  status: IdefixShipmentStatus;
  orderDate?: string;
  createdAt: string;
  updatedAt: string;
  items: IdefixShipmentItem[];
};

export type IdefixPage<T> = {
  totalCount: number;
  itemCount: number;
  pageCount: number;
  currentPage: number;
  limit: number;
  items: T[];
};

export type IdefixClaimItem = {
  // İade satırı; orderLineId sevkiyattaki kalemin id'sidir.
  id: number;
  orderLineId: number;
  barcode: string;
  productName: string;
  state: string;
};

export type IdefixClaim = {
  id: number;
  orderNumber: string;
  items: IdefixClaimItem[];
};

export class UpdateIdefixStockDto {
  @IsString()
  barcode: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class UpdateIdefixPriceDto {
  @IsString()
  barcode: string;

  @IsNumber()
  @Min(0)
  price: number;
}
