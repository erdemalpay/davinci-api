import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { CountList } from './countList.schema';
import { Product } from './product.schema';
import { StockLocation } from './stockLocation.schema';

class CountProduct {
  @Prop({ required: true, type: Number, ref: Product.name })
  product: Product;

  @Prop({ required: true, type: Number })
  stockQuantity: number;

  @Prop({ required: true, type: Number })
  countQuantity: number;
}

@Schema({ _id: false })
export class Count extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string;

  @Prop({ required: true, type: String, ref: CountList.name })
  countList: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  status: string;

  @Prop([CountProduct])
  products: CountProduct[];
}

export const CountSchema = SchemaFactory.createForClass(Count);

purifySchema(CountSchema);

// TODO: Status enum will be added
