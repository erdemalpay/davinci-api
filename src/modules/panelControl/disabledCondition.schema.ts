import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Action } from './action.schema';
import { Page } from './page.schema';

export class Actions {
  @Prop({ required: true, type: String, ref: Action.name })
  action: string;

  @Prop({ required: true, type: [Number] })
  permissionsRoles: number[];
}
@Schema({ _id: false })
export class DisabledCondition extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String, ref: Page.name })
  page: string;

  @Prop([Actions])
  actions: Actions[];
}

export const DisabledConditionSchema =
  SchemaFactory.createForClass(DisabledCondition);

purifySchema(DisabledConditionSchema);
