import { OrderCollectionItem } from './collection.schema';
import { IkasCustomer } from './order.schema';

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
  isReturned?: boolean;
  stockLocation?: number;
  discountNote?: string | string[];
  kitchen?: string;
  stockNote?: string;
  paymentMethod?: string;
  tableDate?: Date;
  ikasId?: string;
  activityTableName?: string;
  activityPlayer?: string;
  ikasCustomer?: IkasCustomer;
  isIkasCustomerPicked?: boolean;
  ikasOrderNumber?: string;
}
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
  location: number;
  amount: number;
  status: string;
  paymentMethod: string;
  orders?: OrderCollectionItem[];
  cancelNote?: string;
  table?: number;
  newOrders?: OrderType[];
  activityPlayer?: string;
  createdBy: string;
  ikasId?: string;
  tableDate?: Date;
  ikasOrderNumber?: string;
  pointUser?: string;
}

export class CreateDiscountDto {
  name: string;
  percentage?: number;
  amount?: number;
  isNoteRequired?: boolean;
  isOnlineOrder?: boolean;
  isStoreOrder?: boolean;
  isVisibleOnPaymentScreen?: boolean;
  status?: string;
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
  after?: string;
  before?: string;
  eliminatedDiscounts?: string;
  discount?: number;
  createdBy?: string;
  preparedBy?: string;
  deliveredBy?: string;
  cancelledBy?: string;
  status?: string;
  category?: string;
  location?: string;
  isIkasPickUp?: boolean;
  item?: number;
}

export class CollectionQueryDto {
  after?: string;
  before?: string;
  location?: string;
}
export class SummaryCollectionQueryDto {
  after?: string;
  before?: string;
  location?: number;
}

export class CreateOrderNotesDto {
  note: string;
  categories?: number[];
  items?: number[];
}
