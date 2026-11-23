import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from '../accounting/product.schema';
import { User } from '../user/user.schema';

// Alıcı türü etiketleri (Tanımlamalar sayfasında yönetilir).
@Schema({ _id: false })
export class GiftTag extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  backgroundColor?: string;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const GiftTagSchema = SchemaFactory.createForClass(GiftTag);

purifySchema(GiftTagSchema);

@Schema({ _id: false, timestamps: true })
export class GiftRecipient extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  name: string;

  @Prop({ type: [{ type: Number, ref: GiftTag.name }], default: [] })
  tags: number[];

  @Prop()
  contactPerson?: string;

  @Prop()
  phone?: string;

  @Prop()
  address?: string;

  @Prop()
  instagramUrl?: string;

  @Prop({ type: Number })
  instagramFollowers?: number;

  @Prop({ type: Number })
  youtubeFollowers?: number;

  @Prop({ required: true, default: false })
  isBlacklisted: boolean;
}

export const GiftRecipientSchema = SchemaFactory.createForClass(GiftRecipient);

purifySchema(GiftRecipientSchema);

class GiftItem {
  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop({ required: true, type: Number })
  quantity: number;
}

@Schema({ _id: false, timestamps: true })
export class Gift extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({
    required: true,
    type: Number,
    ref: GiftRecipient.name,
    index: true,
  })
  recipient: number;

  @Prop({ required: true })
  date: string;

  @Prop([GiftItem])
  items: GiftItem[];

  @Prop({ required: true, type: String, default: 'GIFT' })
  type: string;

  @Prop()
  shareStatus?: string;

  @Prop()
  engagement?: string;

  @Prop()
  orderReference?: string;

  @Prop()
  note?: string;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;
}

export const GiftSchema = SchemaFactory.createForClass(Gift);

purifySchema(GiftSchema);
