import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString
} from 'class-validator';
import { OrderCollectionItem } from './collection.schema';
import { IkasCustomer, Order } from './order.schema';

export class CreateOrderDto {
  @IsNumber()
  location: number;

  @IsNumber()
  item: number;

  @IsOptional()
  @IsNumber()
  table?: number;

  @IsNumber()
  quantity: number;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsDate()
  preparedAt?: Date;

  @IsOptional()
  @IsDate()
  confirmedAt?: Date;

  @IsOptional()
  @IsString()
  confirmedBy?: string;

  @IsOptional()
  @IsString()
  preparedBy?: string;

  @IsOptional()
  @IsDate()
  deliveredAt?: Date;

  @IsOptional()
  @IsString()
  deliveredBy?: string;

  @IsOptional()
  @IsDate()
  cancelledAt?: Date;

  @IsOptional()
  @IsString()
  cancelledBy?: string;

  @IsNumber()
  paidQuantity: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  division?: number;

  @IsOptional()
  @IsBoolean()
  isOnlinePrice?: boolean;

  @IsOptional()
  @IsBoolean()
  isReturned?: boolean;

  @IsOptional()
  @IsNumber()
  stockLocation?: number;

  @IsOptional()
  discountNote?: string | string[];

  @IsOptional()
  @IsString()
  kitchen?: string;

  @IsOptional()
  @IsString()
  stockNote?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsDate()
  tableDate?: Date;

  @IsOptional()
  @IsString()
  ikasId?: string;

  @IsOptional()
  @IsString()
  activityTableName?: string;

  @IsOptional()
  @IsString()
  activityPlayer?: string;

  @IsOptional()
  ikasCustomer?: IkasCustomer;

  @IsOptional()
  @IsBoolean()
  isIkasCustomerPicked?: boolean;

  @IsOptional()
  @IsString()
  ikasOrderNumber?: string;
}

// TODO: Buna ihtiyacimiz var mi? order.schema'daki Order yeterli degil mi?
export type OrderType = {
  _id: number;
  location: number;
  item: number;
  table?: number;
  quantity: number;
  kitchen?: string;
  status: string;
  note?: string;
  unitPrice: number;
  createdAt: Date;
  createdBy: string;
  confirmedAt?: Date;
  confirmedBy?: string;
  preparedAt?: Date;
  preparedBy?: string;
  deliveredAt?: Date;
  deliveredBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  paidQuantity: number;
  discount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  division?: number;
  isOnlinePrice?: boolean;
  isReturned?: boolean;
  stockLocation?: number;
  discountNote?: string;
  stockNote?: string;
  ikasId?: string;
  activityTableName?: string;
  activityPlayer?: string;
  paymentMethod?: string;
  tableDate?: Date;
  isPaymentMade?: boolean;
  ikasCustomer?: IkasCustomer;
  isIkasCustomerPicked?: boolean;
  ikasOrderNumber?: string;
};

export class CreateCollectionDto {
  @IsNumber()
  location: number;

  @IsNumber()
  amount: number;

  @IsString()
  status: string;

  @IsString()
  paymentMethod: string;

  @IsOptional()
  @IsArray()
  orders?: OrderCollectionItem[];

  @IsOptional()
  @IsString()
  cancelNote?: string;

  @IsOptional()
  @IsNumber()
  table?: number;

  @IsOptional()
  @IsArray()
  newOrders?: Order[];

  @IsOptional()
  @IsString()
  activityPlayer?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsOptional()
  @IsString()
  ikasId?: string;

  @IsOptional()
  @IsDate()
  tableDate?: Date;

  @IsOptional()
  @IsString()
  ikasOrderNumber?: string;

  @IsOptional()
  @IsString()
  pointUser?: string;

  @IsOptional()
  @IsNumber()
  pointConsumer?: number;
}

export class CreateDiscountDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  percentage?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsBoolean()
  isNoteRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isOnlineOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  isStoreOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisibleOnPaymentScreen?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
export enum OrderDiscountStatus {
  DELETED = 'deleted',
}

export enum OrderStatus {
  CONFIRMATIONREQ = 'confirmation_req',
  PENDING = 'pending',
  READYTOSERVE = 'ready_to_serve',
  SERVED = 'served',
  CANCELLED = 'cancelled',
  AUTOSERVED = 'autoserved',
  WASTED = 'wasted',
  RETURNED = 'returned',
}
export enum OrderCollectionStatus {
  PAID = 'paid',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export class OrderQueryDto {
  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsString()
  eliminatedDiscounts?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  preparedBy?: string;

  @IsOptional()
  @IsString()
  deliveredBy?: string;

  @IsOptional()
  @IsString()
  cancelledBy?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  isIkasPickUp?: boolean;

  @IsOptional()
  @IsNumber()
  item?: number;
}

export class CollectionQueryDto {
  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
export class SummaryCollectionQueryDto {
  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsNumber()
  location?: number;
}

export class CreateOrderNotesDto {
  @IsString()
  note: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  categories?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  items?: number[];
}

export class CancelIkasOrderDto {
  @IsString()
  ikasId: string;

  @IsNumber()
  quantity: number;
}
