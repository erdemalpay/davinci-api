import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';

export class ItemProductionDto {
  @IsString()
  product: string;

  @IsNumber()
  quantity: number;

  @IsBoolean()
  isDecrementStock: boolean;
}

export class CategoryGroupDto {
  @IsNumber()
  category: number;

  @IsNumber()
  percentage: number;
}

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsArray()
  @IsNumber({}, { each: true })
  locations: number[];

  @IsString()
  kitchen: string;

  @IsBoolean()
  isAutoServed: boolean;

  @IsOptional()
  @IsBoolean()
  isOnlineOrder?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  discounts?: number[];

  @IsOptional()
  @IsBoolean()
  isKitchenMenu?: boolean;
}

export class CreateItemDto {
  @IsString()
  name: string;

  @IsNumber()
  category: number;

  @IsNumber()
  price: number;

  @IsString()
  description: string;

  @IsArray()
  @IsNumber({}, { each: true })
  locations: number[];

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsNumber()
  onlinePrice?: number;

  @IsOptional()
  @IsNumber()
  ikasDiscountedPrice?: number;

  @IsOptional()
  @IsBoolean()
  shownInMenu?: boolean;

  @IsOptional()
  @IsString()
  matchedProduct?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productCategories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productImages?: string[];

  @IsOptional()
  @IsString()
  ikasId?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  suggestedDiscount?: number[];

  @IsOptional()
  @IsBoolean()
  isAutoServed?: boolean;
}
export class CreateBulkItemDto {
  @IsString()
  name: string;

  @IsNumber()
  category: number;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsArray()
  itemProduction?: ItemProductionDto[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  onlinePrice?: number;
}
export class CreateKitchenDto {
  @IsString()
  name: string;

  @IsBoolean()
  isConfirmationRequired: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  locations: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedUsers?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  soundRoles?: number[];
}

export class CreatePopularDto {
  @IsNumber()
  item: number;
}

export class CreateUpperCategoryDto {
  @IsString()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryGroupDto)
  categoryGroup: CategoryGroupDto[];
}
