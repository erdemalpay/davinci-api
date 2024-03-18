export class CreateCategoryDto {
  name: string;
}

export class CreateItemDto {
  name: string;
  category: number;
  priceBahceli: number;
  priceNeorama: number;
}

export class CreatePopularDto {
  item: number;
}
