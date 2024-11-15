import { OrderCollectionItem } from './collection.schema';

export class CreateOrderDto {
  location: number;
  item: number;
  table?: number;
  quantity: number;
  status: string;
  note?: string;
  unitPrice: number;
  createdAt: Date;
  createdBy: string;
  preparedAt?: Date;
  confirmedAt?: Date;
  confirmedBy?: string;
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
  stockLocation?: string;
  discountNote?: string;
  kitchen: string;
  stockNote?: string;
}
export type OrderType = {
  _id: number;
  location: number;
  item: number;
  table?: number;
  quantity: number;
  kitchen: string;
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
  stockLocation?: string;
  discountNote?: string;
  stockNote?: string;
};

export class CreateCollectionDto {
  location: number;
  amount: number;
  status: string;
  paymentMethod: string;
  orders?: OrderCollectionItem[];
  cancelNote?: string;
  table: number;
  newOrders?: OrderType[];
  stockLocation?: string;
}

export class CreateDiscountDto {
  name: string;
  percentage?: number;
  amount?: number;
  isNoteRequired?: boolean;
  isOnlineOrder?: boolean;
  status?: string;
}
export enum OrderDiscountStatus {
  DELETED = 'deleted',
}

export enum OrderStatus {
  PENDING = 'pending',
  READYTOSERVE = 'ready_to_serve',
  SERVED = 'served',
  CANCELLED = 'cancelled',
  AUTOSERVED = 'autoserved',
  WASTED = 'wasted',
}

export class OrderQueryDto {
  after?: string;
  before?: string;
}

export class CollectionQueryDto {
  after?: string;
}
export class SummaryCollectionQueryDto {
  after?: string;
  before?: string;
  location?: number;
}
