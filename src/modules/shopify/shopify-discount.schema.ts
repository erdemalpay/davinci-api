import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum ShopifyDiscountValueType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export enum ShopifyDiscountMinimumRequirementType {
  NONE = 'NONE',
  SUBTOTAL = 'SUBTOTAL',
  QUANTITY = 'QUANTITY',
}

export enum ShopifyDiscountKind {
  ORDER_DISCOUNT = 'ORDER_DISCOUNT',
  FREE_SHIPPING_CODE = 'FREE_SHIPPING_CODE',
  FREE_SHIPPING_AUTOMATIC = 'FREE_SHIPPING_AUTOMATIC',
  PRODUCT_DISCOUNT = 'PRODUCT_DISCOUNT',
  BXGY = 'BXGY',
  BXGY_AUTOMATIC = 'BXGY_AUTOMATIC',
  ORDER_DISCOUNT_AUTOMATIC = 'ORDER_DISCOUNT_AUTOMATIC',
}

@Schema({ _id: false })
export class ShopifyDiscount extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  shopifyId: string;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: false, type: String })
  code?: string;

  @Prop({
    required: false,
    type: String,
    enum: ShopifyDiscountKind,
    default: ShopifyDiscountKind.ORDER_DISCOUNT,
  })
  discountKind?: ShopifyDiscountKind;

  @Prop({ required: false, type: String, enum: ShopifyDiscountValueType })
  valueType?: ShopifyDiscountValueType;

  @Prop({ required: false, type: Number })
  value?: number;

  @Prop({ required: true, type: Date })
  startsAt: Date;

  @Prop({ required: false, type: Date })
  endsAt?: Date;

  @Prop({
    required: false,
    type: String,
    enum: ShopifyDiscountMinimumRequirementType,
    default: ShopifyDiscountMinimumRequirementType.NONE,
  })
  minimumRequirementType?: ShopifyDiscountMinimumRequirementType;

  @Prop({ required: false, type: Number })
  minimumRequirementValue?: number;

  @Prop({ required: false, type: Number })
  usageLimit?: number;

  @Prop({ required: false, type: Boolean, default: false })
  appliesOncePerCustomer?: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  combinesWithProductDiscounts?: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  combinesWithOrderDiscounts?: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  combinesWithShippingDiscounts?: boolean;

  @Prop({ required: false, type: String })
  appliesTo?: string;

  @Prop({ required: false, type: [String], default: undefined })
  productIds?: string[];

  @Prop({ required: false, type: [String], default: undefined })
  collectionIds?: string[];

  // BXGY fields
  @Prop({ required: false, type: String })
  buyRequirementType?: string;

  @Prop({ required: false, type: Number })
  buyQuantityOrAmount?: number;

  @Prop({ required: false, type: String })
  buyProductScope?: string;

  @Prop({ required: false, type: [String], default: undefined })
  buyProductIds?: string[];

  @Prop({ required: false, type: [String], default: undefined })
  buyCollectionIds?: string[];

  @Prop({ required: false, type: Number })
  getQuantity?: number;

  @Prop({ required: false, type: String })
  getProductScope?: string;

  @Prop({ required: false, type: [String], default: undefined })
  getProductIds?: string[];

  @Prop({ required: false, type: [String], default: undefined })
  getCollectionIds?: string[];

  @Prop({ required: false, type: String })
  bxgyDiscountType?: string;

  @Prop({ required: false, type: Number })
  bxgyDiscountValue?: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: false, type: String })
  createdBy?: string;
}

export const ShopifyDiscountSchema =
  SchemaFactory.createForClass(ShopifyDiscount);

ShopifyDiscountSchema.index({ code: 1 }, { unique: true, sparse: true });
ShopifyDiscountSchema.index({ shopifyId: 1 });

purifySchema(ShopifyDiscountSchema);
