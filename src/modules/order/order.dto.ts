export class CreateOrderDto {
  location: number;
  item: number;
  table: number;
  quantity: number;
  //   status: string;
  note?: string;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  //   createdAt: Date;//this will be taken from the user
  //   createdBy: string; //this will be taken from the user
  preparedAt?: Date;
  preparedBy?: string;
  deliveredAt?: Date;
  deliveredBy?: string;
}
