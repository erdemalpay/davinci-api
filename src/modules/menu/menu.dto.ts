export class CreateCategoryDto {
  name: string;
  locations: number[];
  kitchen: string;
  isAutoServed: boolean;
  isOnlineOrder?: boolean;
  discounts?: number[];
}

export class CreateItemDto {
  name: string;
  category: number;
  price: number;
  description: string;
  locations: number[];
  order: number;
  onlinePrice?: number;
  matchedProduct?: string;
}
export class CreateKitchenDto {
  name: string;
}

export class CreatePopularDto {
  item: number;
}
