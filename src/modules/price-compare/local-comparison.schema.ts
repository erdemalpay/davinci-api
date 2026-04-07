import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ timestamps: true })
export class LocalComparison extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, index: true })
  normalizedName: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Object, default: {} })
  prices: Record<string, number>;

  @Prop({ required: false, type: Date })
  lastSyncedAt: Date;
}

export const LocalComparisonSchema =
  SchemaFactory.createForClass(LocalComparison);

LocalComparisonSchema.index({ normalizedName: 1 }, { unique: true });

purifySchema(LocalComparisonSchema);
