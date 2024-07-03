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
}
