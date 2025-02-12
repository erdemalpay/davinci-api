export class CreateExpirationListDto {
  name: string;
  products?: ExpirationListsProduct[];
}

export class ExpirationListsProduct {
  product: string;
  locations: number[];
}

export class DateQuantityDto {
  expirationDate: string;
  quantity: number;
}

export class CreateExpirationCountProductDto {
  product: string;
  dateQuantities: DateQuantityDto[];
}

export class CreateExpirationCountDto {
  user: string;
  location: number;
  expirationList: string;
  products: CreateExpirationCountProductDto[];
}
