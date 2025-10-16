import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class DisabledCondition extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: [Number] })
  permissionRoles: number[];
}

export const DisabledConditionSchema =
  SchemaFactory.createForClass(DisabledCondition);

purifySchema(DisabledConditionSchema);
