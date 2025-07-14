import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class PanelSettings extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Boolean })
  isHoliday: boolean;

  @Prop({ required: true, type: Boolean })
  isVisitEntryDisabled: boolean;
}

export const PanelSettingsSchema = SchemaFactory.createForClass(PanelSettings);
purifySchema(PanelSettingsSchema);
