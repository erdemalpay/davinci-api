import { OrderCollectionItem } from './collection.schema';

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
export type OrderType = {
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
  paidQuantity: number;
  discount?: number;
  discountPercentage?: number;
};

export class CreateCollectionDto {
  location: number;
  amount: number;
  status: string;
  paymentMethod: string;
  orders?: OrderCollectionItem[];
  cancelNote?: string;
  table: number;
}

export class CreateDiscountDto {
  name: string;
  percentage: number;
}
