import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { ExpenseType } from './expenseType.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Service extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: Number })
  unitPrice: number;

  @Prop({ required: true, type: [{ type: String, ref: ExpenseType.name }] })
  expenseType: string[];

  @Prop({ required: false, type: [{ type: String, ref: Vendor.name }] })
  vendor: string[];
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

purifySchema(ServiceSchema);
