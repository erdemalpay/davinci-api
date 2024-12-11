import { CategoryGroup } from './upperCategory.schema';

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
export class CreateBulkItemDto {
  name: string;
  category: number;
  price: number;
  description?: string;
  onlinePrice?: number;
}
export class CreateKitchenDto {
  name: string;
  isConfirmationRequired: boolean;
  locatins: number[];
}

export class CreatePopularDto {
  item: number;
}

export class CreateUpperCategoryDto {
  name: string;
  categoryGroup: CategoryGroup[];
}
