export class CreateCategoryDto {
  name: string;
}

export class CreateItemDto {
  name: string;
  category: number;
  price: number;
}

export class CreatePopularDto {
  item: number;
}
