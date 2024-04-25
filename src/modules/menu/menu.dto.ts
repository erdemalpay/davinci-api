export class CreateCategoryDto {
  name: string;
}

export class CreateItemDto {
  name: string;
  category: number;
  price: number;
  description: string;
  locations: number[];
  order: number;
}

export class CreatePopularDto {
  item: number;
}
