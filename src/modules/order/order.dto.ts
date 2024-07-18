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
}

export class CreateCollectionDto {
  location: number;
  amount: number;
  status: string;
  paymentMethod: string;
  orderPayment: number;
  refund?: number;
}

export class CreatePaymentDto {
  location: number;
  totalAmount: number;
  discount?: number;
  orders?: OrderPaymentItem[];
  collections?: number[];
  table: number;
}

export class CreateDiscountDto {
  name: string;
  percentage: number;
}
