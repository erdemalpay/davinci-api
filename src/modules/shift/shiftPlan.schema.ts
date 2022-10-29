import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { ShiftRequest, ShiftRequestSchema } from './shiftRequest.schema';
import { ShiftSlot, ShiftSlotSchema } from './shiftSlot.schema';

@Schema({ _id: false })
export class ShiftPlan extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Boolean, default: false })
  collectingRequests: boolean;

  @Prop({ required: true })
  startDate: string;

  @Prop({ type: [ShiftRequestSchema] })
  requests: ShiftRequest[];

  @Prop({ type: ShiftSlotSchema })
  slots: ShiftSlot[];
}

export const ShiftPlanSchema = SchemaFactory.createForClass(ShiftPlan);

purifySchema(ShiftPlanSchema);
