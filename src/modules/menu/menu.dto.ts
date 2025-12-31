import { CategoryGroup } from './upperCategory.schema';

export class CreateCategoryDto {
  name: string;
  locations: number[];
  kitchen: string;
  isAutoServed: boolean;
  isOnlineOrder?: boolean;
  discounts?: number[];
  isKitchenMenu?: boolean;
}

export class CreateItemDto {
  name: string;
  category: number;
  price: number;
  description: string;
  locations: number[];
  order: number;
  onlinePrice?: number;
  ikasDiscountedPrice?: number;
  shownInMenu?: boolean;
  matchedProduct?: string;
  productCategories?: string[];
  productImages?: string[];
  ikasId?: string;
  slug?: string;
  deleted?: boolean;
  sku?: string;
  barcode?: string;
  suggestedDiscount?: number[];
  isAutoServed?: boolean;
}
export class CreateBulkItemDto {
  name: string;
  category: number;
  price: number;
  sku?: string;
  barcode?: string;
  itemProduction?: {
    product: string;
    quantity: number;
    isDecrementStock: boolean;
  }[];
  description?: string;
  onlinePrice?: number;
}
export class CreateKitchenDto {
  name: string;
  isConfirmationRequired: boolean;
  locatins: number[];
  selectedUsers?: string[];
  soundRoles?: number[];
}

export class CreatePopularDto {
  item: number;
}

export class CreateUpperCategoryDto {
  name: string;
  categoryGroup: CategoryGroup[];
}
