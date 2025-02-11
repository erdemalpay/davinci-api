import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from '../accounting/product.schema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { ExpirationList } from './expirationList.schema';

class DateQuantities {
  @Prop({ required: true, type: String })
  expirationDate: string;

  @Prop({ required: true, type: Number })
  quantity: number;
}

class ExpirationCountProduct {
  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop([DateQuantities])
  dateQuantities: DateQuantities[];
}

@Schema({ _id: false })
export class ExpirationCount extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: String, ref: ExpirationList.name })
  expirationList: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: false, type: Date })
  completedAt: Date;

  @Prop({ required: true })
  isCompleted: boolean;

  @Prop([ExpirationCountProduct])
  products: ExpirationCountProduct[];
}

export const ExpirationCountSchema =
  SchemaFactory.createForClass(ExpirationCount);

purifySchema(ExpirationCountSchema);

// TODO: Status enum will be added
