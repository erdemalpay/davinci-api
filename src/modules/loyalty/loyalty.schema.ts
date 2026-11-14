import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

// Online (kutuoyunual.com) loyalty points. Kept apart from the cafe points in
// the point module: an account belongs to a Shopify customer, 1 point = 1 TL.

export enum LoyaltyTransactionType {
  EARN = 'EARN', // order fulfilled
  EARN_REVERSAL = 'EARN_REVERSAL', // order refunded or cancelled
  REDEEM = 'REDEEM', // points turned into a coupon
  COUPON_RETURN = 'COUPON_RETURN', // the order that used the coupon was cancelled
  MANUAL = 'MANUAL', // added or removed from the panel
}

export enum LoyaltyCouponStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
}

@Schema({ _id: false })
export class LoyaltyAccount extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, unique: true, index: true })
  shopifyCustomerId: string;

  @Prop({ type: String })
  email: string;

  @Prop({ type: String })
  name: string;

  // Can go below zero when points already spent are taken back by a refund.
  @Prop({ required: true, type: Number, default: 0 })
  balance: number;

  @Prop({ required: true, type: Number, default: 0 })
  totalEarned: number;

  @Prop({ required: true, type: Number, default: 0 })
  totalRedeemed: number;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const LoyaltyAccountSchema =
  SchemaFactory.createForClass(LoyaltyAccount);
purifySchema(LoyaltyAccountSchema);

@Schema({ _id: false })
export class LoyaltyTransaction extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: LoyaltyAccount.name, index: true })
  account: number;

  @Prop({ required: true, type: String, index: true })
  shopifyCustomerId: string;

  @Prop({ required: true, type: String, enum: LoyaltyTransactionType })
  type: LoyaltyTransactionType;

  // Signed: positive adds points, negative removes them.
  @Prop({ required: true, type: Number })
  change: number;

  @Prop({ required: true, type: Number })
  balanceAfter: number;

  @Prop({ type: String })
  shopifyOrderId?: string;

  @Prop({ type: String })
  shopifyOrderName?: string;

  // Order amount the points were calculated from (EARN).
  @Prop({ type: Number })
  orderAmount?: number;

  // Earn rate (%) in use when the points were earned (EARN).
  @Prop({ type: Number })
  rate?: number;

  @Prop({ type: String })
  couponCode?: string;

  @Prop({ type: String })
  note?: string;

  // Panel user for MANUAL, 'customer' for REDEEM, 'shopify' for webhooks.
  @Prop({ type: String })
  createdBy?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;
}

export const LoyaltyTransactionSchema =
  SchemaFactory.createForClass(LoyaltyTransaction);
// A webhook retry must never pay the same order twice.
LoyaltyTransactionSchema.index(
  { shopifyOrderId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: {
        $in: [
          LoyaltyTransactionType.EARN,
          LoyaltyTransactionType.COUPON_RETURN,
        ],
      },
    },
  },
);
purifySchema(LoyaltyTransactionSchema);

@Schema({ _id: false })
export class LoyaltyCoupon extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: LoyaltyAccount.name, index: true })
  account: number;

  @Prop({ required: true, type: String, index: true })
  shopifyCustomerId: string;

  @Prop({ required: true, type: String, unique: true })
  code: string;

  // TL off the order = points spent.
  @Prop({ required: true, type: Number })
  value: number;

  @Prop({
    required: true,
    type: String,
    enum: LoyaltyCouponStatus,
    index: true,
  })
  status: LoyaltyCouponStatus;

  @Prop({ type: String })
  shopifyDiscountId: string;

  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ type: String })
  usedOrderId?: string;

  @Prop({ type: String })
  usedOrderName?: string;

  @Prop({ type: Date })
  usedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const LoyaltyCouponSchema = SchemaFactory.createForClass(LoyaltyCoupon);
purifySchema(LoyaltyCouponSchema);

export const LOYALTY_SETTINGS_ID = 'default';

@Schema()
export class LoyaltySettings extends Document {
  @Prop({ type: String, default: LOYALTY_SETTINGS_ID })
  _id: string;

  // When off, no points are earned and no coupons can be created.
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // Percent of the order amount (after discounts, without shipping).
  @Prop({ type: Number, default: 3 })
  earnRate: number;

  @Prop({ type: Number, default: 30 })
  couponValidityDays: number;

  @Prop({ type: Number, default: 50 })
  minRedeemPoints: number;

  @Prop({ type: String })
  updatedBy?: string;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const LoyaltySettingsSchema =
  SchemaFactory.createForClass(LoyaltySettings);
purifySchema(LoyaltySettingsSchema);
