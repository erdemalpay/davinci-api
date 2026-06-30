export enum OrderCancelReason {
  CUSTOMER = 'CUSTOMER',
  FRAUD = 'FRAUD',
  INVENTORY = 'INVENTORY',
  DECLINED = 'DECLINED',
  OTHER = 'OTHER',
}

export enum DiscountValueType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export enum DiscountMinimumRequirementType {
  NONE = 'NONE',
  SUBTOTAL = 'SUBTOTAL',
  QUANTITY = 'QUANTITY',
}

export class CreateOrderDiscountDto {
  title: string;
  code: string;
  valueType: DiscountValueType;
  value: number;
  startsAt: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateOrderDiscountDto {
  id: string;
  title?: string;
  code?: string;
  valueType?: DiscountValueType;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export enum FreeShippingMethod {
  CODE = 'CODE',
  AUTOMATIC = 'AUTOMATIC',
}

export class CreateFreeShippingDiscountDto {
  method: FreeShippingMethod;
  title: string;
  code?: string;
  startsAt: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
}

export class UpdateFreeShippingDiscountDto {
  id: string;
  title?: string;
  code?: string;
  startsAt?: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
}

export enum ProductDiscountAppliesTo {
  ALL = 'ALL',
  PRODUCTS = 'PRODUCTS',
  COLLECTIONS = 'COLLECTIONS',
}

export class CreateProductDiscountDto {
  title: string;
  code: string;
  valueType: DiscountValueType;
  value: number;
  appliesTo: ProductDiscountAppliesTo;
  productIds?: string[];
  collectionIds?: string[];
  startsAt: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateProductDiscountDto {
  id: string;
  title?: string;
  code?: string;
  valueType?: DiscountValueType;
  value?: number;
  appliesTo?: ProductDiscountAppliesTo;
  productIds?: string[];
  collectionIds?: string[];
  startsAt?: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class CreateAutomaticProductDiscountDto {
  title: string;
  valueType: DiscountValueType;
  value: number;
  appliesTo: ProductDiscountAppliesTo;
  productIds?: string[];
  collectionIds?: string[];
  startsAt: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateAutomaticProductDiscountDto {
  id: string;
  title?: string;
  valueType?: DiscountValueType;
  value?: number;
  appliesTo?: ProductDiscountAppliesTo;
  productIds?: string[];
  collectionIds?: string[];
  startsAt?: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class CreateAutomaticOrderDiscountDto {
  title: string;
  valueType: DiscountValueType;
  value: number;
  startsAt: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateAutomaticOrderDiscountDto {
  id: string;
  title?: string;
  valueType?: DiscountValueType;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  minimumRequirementType?: DiscountMinimumRequirementType;
  minimumRequirementValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export enum BxgyBuyRequirementType {
  QUANTITY = 'QUANTITY',
  AMOUNT = 'AMOUNT',
}

export enum BxgyProductScope {
  ALL = 'ALL',
  PRODUCTS = 'PRODUCTS',
  COLLECTIONS = 'COLLECTIONS',
}

export enum BxgyDiscountType {
  PERCENTAGE = 'PERCENTAGE',
  AMOUNT = 'AMOUNT',
  FREE = 'FREE',
}

export class CreateBxgyDiscountDto {
  title: string;
  code: string;
  startsAt: string;
  endsAt?: string;
  buyRequirementType: BxgyBuyRequirementType;
  buyQuantityOrAmount: number;
  buyProductScope: BxgyProductScope;
  buyProductIds?: string[];
  buyCollectionIds?: string[];
  getQuantity: number;
  getProductScope: BxgyProductScope;
  getProductIds?: string[];
  getCollectionIds?: string[];
  bxgyDiscountType: BxgyDiscountType;
  bxgyDiscountValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateBxgyDiscountDto {
  id: string;
  title?: string;
  code?: string;
  startsAt?: string;
  endsAt?: string;
  buyRequirementType?: BxgyBuyRequirementType;
  buyQuantityOrAmount?: number;
  buyProductScope?: BxgyProductScope;
  buyProductIds?: string[];
  buyCollectionIds?: string[];
  getQuantity?: number;
  getProductScope?: BxgyProductScope;
  getProductIds?: string[];
  getCollectionIds?: string[];
  bxgyDiscountType?: BxgyDiscountType;
  bxgyDiscountValue?: number;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class CreateAutomaticBxgyDiscountDto {
  title: string;
  startsAt: string;
  endsAt?: string;
  buyRequirementType: BxgyBuyRequirementType;
  buyQuantityOrAmount: number;
  buyProductScope: BxgyProductScope;
  buyProductIds?: string[];
  buyCollectionIds?: string[];
  getQuantity: number;
  getProductScope: BxgyProductScope;
  getProductIds?: string[];
  getCollectionIds?: string[];
  bxgyDiscountType: BxgyDiscountType;
  bxgyDiscountValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}

export class UpdateAutomaticBxgyDiscountDto {
  id: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  buyRequirementType?: BxgyBuyRequirementType;
  buyQuantityOrAmount?: number;
  buyProductScope?: BxgyProductScope;
  buyProductIds?: string[];
  buyCollectionIds?: string[];
  getQuantity?: number;
  getProductScope?: BxgyProductScope;
  getProductIds?: string[];
  getCollectionIds?: string[];
  bxgyDiscountType?: BxgyDiscountType;
  bxgyDiscountValue?: number;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
}
