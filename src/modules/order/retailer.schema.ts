import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Retailer extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: false, type: String })
  tenantSlug: string;

  @Prop({ required: false, type: String })
  projectSlug: string;
}

export const RetailerSchema = SchemaFactory.createForClass(Retailer);
purifySchema(RetailerSchema);
