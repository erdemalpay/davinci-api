export class CreateExpirationListDto {
  name: string;
  products?: ExpirationListsProduct[];
}

export class ExpirationListsProduct {
  product: string;
  locations: number[];
}
