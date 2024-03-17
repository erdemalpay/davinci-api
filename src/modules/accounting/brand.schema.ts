import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Brand extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;
}

export const BrandSchema = SchemaFactory.createForClass(Brand);

purifySchema(BrandSchema);
