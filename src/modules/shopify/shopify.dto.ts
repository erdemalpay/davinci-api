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
