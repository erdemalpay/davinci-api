import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class ExpenseType extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String })
  backgroundColor: string;

  @Prop({ required: false, type: Boolean, default: false })
  isRoleRestricted: boolean;

  @Prop({ required: false, type: [Number], default: [] })
  allowedRoles: number[];
}

export const ExpenseTypeSchema = SchemaFactory.createForClass(ExpenseType);

purifySchema(ExpenseTypeSchema);
