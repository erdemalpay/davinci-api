import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export const N11_REST_BASE_URL = 'https://api.n11.com';
export const N11_SOAP_BASE_URL = 'https://api.n11.com/ws';

export type N11Product = {
  n11ProductId: number;
  stockCode: string;
  barcode: string | null;
  title: string;
  status: string;
  saleStatus: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
  currencyType: string;
};

export type N11ProductPage = {
  content: N11Product[];
  totalPages: number;
  totalElements: number;
};

// Gönderilmeyen alan n11'de değişmez (yalnız stok ya da yalnız fiyat yollanabilir).
export type N11SkuUpdate = {
  stockCode: string;
  quantity?: number;
  listPrice?: number;
  salePrice?: number;
};

export type N11TaskResponse = {
  id: number;
  type: string;
  status: 'IN_QUEUE' | 'REJECT';
  reasons: string[];
};

export type N11TaskDetail = {
  taskId: number;
  status: 'PROCESSED' | 'IN_QUEUE' | 'REJECT';
  skus: {
    content: Array<{
      itemCode: string;
      status: 'SUCCESS' | 'FAIL';
      reasons: string[];
    }>;
    totalPages: number;
  };
};

export type N11PackageStatus =
  | 'Created'
  | 'Picking'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Unpacked'
  | 'UnSupplied';

export type N11OrderLine = {
  orderLineId: number;
  productId: number;
  productName: string;
  stockCode: string;
  barcode: string | null;
  quantity: number;
  price: number;
  sellerInvoiceAmount?: number;
  orderItemLineItemStatusName: string;
};

export type N11ShipmentPackage = {
  // Konuma özel teslimatta null gelir.
  id: string | number | null;
  orderNumber: string;
  shipmentPackageStatus: N11PackageStatus;
  lastModifiedDate: number;
  packageHistories?: Array<{ createdDate: number; status: string }>;
  lines: N11OrderLine[];
};

export type N11ShipmentPackagePage = {
  content: N11ShipmentPackage[];
  totalPages: number;
};

export type N11ClaimReturn = {
  claimReturnId: string;
  status: string;
  orderNumber: string;
  productId: string;
  productName?: string;
  quantity: number;
  returnReasonType?: string;
};

export class UpdateN11StockDto {
  @IsString()
  stockCode: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class UpdateN11PriceDto {
  @IsString()
  stockCode: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class MatchN11ItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  itemIds: number[];
}
