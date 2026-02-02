import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

// Trendyol Sipariş Durumları
export enum TrendyolOrderStatus {
  CREATED = 'Created',
  PICKING = 'Picking',
  INVOICED = 'Invoiced',
  SHIPPED = 'Shipped',
  CANCELLED = 'Cancelled',
  DELIVERED = 'Delivered',
  UNDELIVERED = 'UnDelivered',
  RETURNED = 'Returned',
  REDELIVERED = 'Redelivered',
  AWAITING = 'Awaiting',
  AT_COLLECTION_POINT = 'AtCollectionPoint',
  UNPACKED = 'UnPacked',
  UNSUPPLIED = 'UnSupplied',
}

// Query parametreleri için DTO
export class GetTrendyolOrdersQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  startDate?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  endDate?: number;

  @IsOptional()
  @IsEnum(TrendyolOrderStatus)
  status?: TrendyolOrderStatus;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsString()
  orderByField?: 'PackageLastModifiedDate';

  @IsOptional()
  @IsString()
  orderByDirection?: 'ASC' | 'DESC';
}

// Sadeleştirilmiş Line Item Response
export interface TrendyolOrderLineDto {
  id: number;
  title: string;
  quantity: number;
  price: number;
  productId: number;
  sku: string;
  barcode: string;
}

// Sadeleştirilmiş Order Response
export interface TrendyolOrderDto {
  id: number;
  orderNumber: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  totalPrice: number;
  currencyCode: string;
  status: string;
  lines: TrendyolOrderLineDto[];
}

// Paginated Response
export interface TrendyolOrdersResponseDto {
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  content: TrendyolOrderDto[];
}
