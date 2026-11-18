import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ timestamps: true })
export class ProcessedAmazonReturn extends Document {
  @Prop({ required: true, type: String, unique: true })
  returnKey: string;

  @Prop({ required: true, type: String })
  orderNumber: string;

  @Prop({ required: true, type: String })
  sku: string;

  @Prop({ required: true, type: Number })
  quantity: number;

  // SELLABLE, DEFECTIVE ...
  @Prop({ required: true, type: String })
  disposition: string;

  // CANCELLED | CANCELLED_TO_LOST | ORDER_NOT_FOUND
  @Prop({ required: true, type: String })
  action: string;

  @Prop({ required: true, type: Boolean, default: true })
  success: boolean;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: true, type: Date, default: Date.now })
  processedAt: Date;
}

export const ProcessedAmazonReturnSchema = SchemaFactory.createForClass(
  ProcessedAmazonReturn,
);

ProcessedAmazonReturnSchema.index({ orderNumber: 1, processedAt: -1 });

purifySchema(ProcessedAmazonReturnSchema);
