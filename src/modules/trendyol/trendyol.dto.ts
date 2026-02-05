import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// Trendyol Sipariş Durumları
export enum TrendyolOrderStatus {
  CREATED = 'CREATED',
  PICKING = 'PICKING',
  INVOICED = 'INVOICED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
  DELIVERED = 'DELIVERED',
  UNDELIVERED = 'UNDELIVERED',
  RETURNED = 'RETURNED',
  UNSUPPLIED = 'UNSUPPLIED',
  AWAITING = 'AWAITING',
  UNPACKED = 'UNPACKED',
  AT_COLLECTION_POINT = 'AT_COLLECTION_POINT',
  VERIFIED = 'VERIFIED',
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

// Webhook Authentication Types
export enum WebhookAuthenticationType {
  API_KEY = 'API_KEY',
  BASIC = 'BASIC_AUTHENTICATION',
}

// Webhook Status
export enum WebhookStatus {
  ACTIVE = 'ACTIVE',
  PASSIVE = 'PASSIVE',
}

// Webhook Response DTO
export interface TrendyolWebhookDto {
  id: string;
  createdDate: number;
  lastModifiedDate: number | null;
  url: string;
  username: string;
  authenticationType: WebhookAuthenticationType;
  status: WebhookStatus;
  subscribedStatuses: TrendyolOrderStatus[] | null;
}

// Create Webhook DTO
export class CreateTrendyolWebhookDto {
  @IsString()
  url: string;

  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsEnum(WebhookAuthenticationType)
  authenticationType: WebhookAuthenticationType;

  @IsString()
  apiKey: string;

  @IsArray()
  @IsEnum(TrendyolOrderStatus, { each: true })
  subscribedStatuses: TrendyolOrderStatus[];
}

// Product Query Parameters
export class GetTrendyolProductsQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsString()
  approved?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  startDate?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  endDate?: number;

  @IsOptional()
  @IsString()
  archived?: string;

  @IsOptional()
  @IsString()
  onsale?: string;
}

// Product Image Interface
export interface TrendyolProductImage {
  url: string;
}

// Product Attribute Interface
export interface TrendyolProductAttribute {
  attributeId: number;
  attributeName: string;
  attributeValueId?: number;
  attributeValue?: string;
}

// Delivery Option Interface
export interface TrendyolDeliveryOption {
  deliveryDuration: number;
  fastDeliveryType?: string;
}

// Product Response Interface
export interface TrendyolProductDto {
  id: string;
  approved: boolean;
  archived: boolean;
  productCode: number;
  batchRequestId: string;
  supplierId: number;
  createDateTime: number;
  lastUpdateDate: number;
  gender?: string;
  brand: string;
  barcode: string;
  trendyolBarcode: string;
  title: string;
  categoryName: string;
  productMainId: string;
  description: string;
  stockUnitType: string;
  quantity: number;
  listPrice: number;
  salePrice: number;
  vatRate: number;
  dimensionalWeight: number;
  stockCode: string;
  locationBasedDelivery?: string;
  lotNumber?: string;
  deliveryOption?: TrendyolDeliveryOption;
  images: TrendyolProductImage[];
  attributes: TrendyolProductAttribute[];
  platformListingId: string;
  stockId: string;
  hasActiveCampaign: boolean;
  locked: boolean;
  productContentId: number;
  pimCategoryId: number;
  brandId: number;
  version: number;
  color?: string;
  size?: string;
  lockedByUnSuppliedReason: boolean;
  onsale: boolean;
  productUrl?: string;
}

// Paginated Products Response
export interface TrendyolProductsResponseDto {
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  content: TrendyolProductDto[];
}

// Update Price and Inventory Item
export class UpdatePriceAndInventoryItemDto {
  @IsString()
  barcode: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  salePrice: number;

  @IsNumber()
  listPrice: number;
}

// Update Price and Inventory Request
export class UpdatePriceAndInventoryDto {
  @IsArray()
  items: UpdatePriceAndInventoryItemDto[];
}

// Batch Request Response
export interface BatchRequestResponseDto {
  batchRequestId: string;
}

// Claims (İade Talepleri) için DTO'lar

export interface TrendyolClaimItemReasonDto {
  id: number;
  name: string;
  externalReasonId: number;
  code: string;
}

export interface TrendyolClaimItemStatusDto {
  name: string; // "Accepted", "Created", vb.
}

export interface TrendyolClaimItemDto {
  id: string; // Unique claim item ID
  orderLineItemId: number;
  customerClaimItemReason: TrendyolClaimItemReasonDto;
  trendyolClaimItemReason: TrendyolClaimItemReasonDto;
  claimItemStatus: TrendyolClaimItemStatusDto;
  autoApproveDate?: number;
  note: string;
  customerNote?: string;
  resolved: boolean;
  autoAccepted: boolean | null;
  acceptedBySeller: boolean | null;
  acceptDetail: string | null;
}

export interface TrendyolOrderLineWithClaimsDto {
  orderLine: {
    id: number;
    productName: string;
    barcode: string;
    merchantSku: string;
    productColor: string;
    productSize: string;
    price: number;
    vatBaseAmount: number;
    vatRate: number;
    salesCampaignId: number;
    productCategory: string;
    lineItems: any | null;
  };
  claimItems: TrendyolClaimItemDto[];
}

export interface TrendyolClaimDto {
  id: string; // Claim ID (claimId)
  claimId: string;
  orderNumber: string;
  orderDate: number;
  customerFirstName: string;
  customerLastName: string;
  claimDate: number;
  cargoTrackingNumber?: number;
  cargoProviderName?: string;
  cargoSenderNumber?: string;
  cargoTrackingLink?: string;
  orderShipmentPackageId: number;
  items: TrendyolOrderLineWithClaimsDto[];
  lastModifiedDate: number;
  orderOutboundPackageId: number;
}

// Query parametreleri için DTO
export class GetTrendyolClaimsQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  startDate?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  endDate?: number;
}
