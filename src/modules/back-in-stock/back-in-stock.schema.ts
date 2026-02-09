import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';
import { MenuItem } from '../menu/item.schema';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  NOTIFIED = 'NOTIFIED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false, timestamps: true })
export class BackInStockSubscription extends Document {
  @Prop({ type: Number })
  _id!: number;

  @Prop({ required: true, index: true })
  email!: string;

  @Prop({ required: true })
  shop!: string;

  @Prop({ required: true, index: true })
  productId!: string;

  @Prop({ required: true })
  productTitle!: string;

  @Prop({ required: true })
  productUrl!: string;

  @Prop({ required: true, index: true })
  variantId!: string;

  @Prop({ required: true })
  variantTitle!: string;

  @Prop({ required: true })
  variantPrice!: string;

  @Prop({ required: true })
  subscribedAt!: Date;

  @Prop({ required: true, default: SubscriptionStatus.ACTIVE })
  status!: SubscriptionStatus;

  @Prop({ type: Number, ref: MenuItem.name })
  menuItemId?: number;

  @Prop()
  notifiedAt?: Date;

  @Prop()
  cancelledAt?: Date;
}

export const BackInStockSubscriptionSchema = SchemaFactory.createForClass(
  BackInStockSubscription,
);

purifySchema(BackInStockSubscriptionSchema);
