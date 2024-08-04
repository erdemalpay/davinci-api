export class CreateCategoryDto {
  name: string;
  locations: number[];
  kitchen: string;
  isAutoServed: boolean;
}

export class CreateItemDto {
  name: string;
  category: number;
  price: number;
  description: string;
  locations: number[];
  order: number;
}
export class CreateKitchenDto {
  name: string;
}

export class CreatePopularDto {
  item: number;
}
