import { OrderCollectionItem } from './collection.schema';
import { OrderPaymentItem } from './orderPayment.schema';

export class CreateOrderDto {
  location: number;
  item: number;
  table: number;
  quantity: number;
  note?: string;
  unitPrice: number;
  totalPrice: number;
  preparedAt?: Date;
  preparedBy?: string;
  deliveredAt?: Date;
  deliveredBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdAt?: Date;
  createdBy?: string;
  status?: string;
}
export type Order = {
  _id: number;
  location: number;
  item: number;
  table: number;
  quantity: number;
  status: string;
  note?: string;
  unitPrice: number;
  createdAt: Date;
  createdBy: string;
  preparedAt?: Date;
  preparedBy?: string;
  deliveredAt?: Date;
  deliveredBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
};

export class CreateCollectionDto {
  location: number;
  amount: number;
  status: string;
  paymentMethod: string;
  orderPayment: number[];
  orders?: OrderCollectionItem[];
  cancelNote?: string;
}

export class CreatePaymentDto {
  location: number;
  totalAmount: number;
  discountAmount: number;
  orders?: OrderPaymentItem[];
  collections?: number[];
  table: number;
}

export class CreateDiscountDto {
  name: string;
  percentage: number;
}
