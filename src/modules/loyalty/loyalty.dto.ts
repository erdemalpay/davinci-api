import { LoyaltyCouponStatus, LoyaltyTransactionType } from './loyalty.schema';

export class UpdateLoyaltySettingsDto {
  isActive?: boolean;
  earnRate?: number;
  couponValidityDays?: number;
  minRedeemPoints?: number;
}

export class AdjustLoyaltyPointsDto {
  // Signed points: positive adds, negative removes.
  change: number;
  note: string;
}

export class RedeemLoyaltyPointsDto {
  amount: number;
}

export class LoyaltyAccountFilter {
  page?: number;
  limit?: number;
  search?: string;
}

export class LoyaltyTransactionFilter {
  page?: number;
  limit?: number;
  type?: LoyaltyTransactionType;
  shopifyCustomerId?: string;
  after?: string;
  before?: string;
}

export class LoyaltyCouponFilter {
  page?: number;
  limit?: number;
  status?: LoyaltyCouponStatus;
}
