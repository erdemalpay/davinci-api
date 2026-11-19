import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

// A product a kutuoyunual.com customer marked with the heart button.
// Products are kept by id (handles can change); the handle is only a hint the
// theme uses to render the card and is refreshed whenever we read the product.
@Schema({ _id: false })
export class Favorite extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, index: true })
  shopifyCustomerId: string;

  @Prop({ required: true, type: String, index: true })
  shopifyProductId: string;

  @Prop({ type: String })
  handle: string;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
FavoriteSchema.index(
  { shopifyCustomerId: 1, shopifyProductId: 1 },
  { unique: true },
);
purifySchema(FavoriteSchema);
