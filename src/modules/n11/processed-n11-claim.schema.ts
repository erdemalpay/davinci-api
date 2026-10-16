import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ timestamps: true })
export class ProcessedN11Claim extends Document {
  @Prop({ required: true, type: String, unique: true })
  claimReturnId: string;

  @Prop({ required: true, type: String })
  orderNumber: string;

  @Prop({ required: true, type: String })
  statusAtProcess: string;

  // CANCELLED | PARTIALLY_CANCELLED | ORDER_NOT_FOUND
  @Prop({ required: true, type: String })
  action: string;

  @Prop({ required: true, type: Boolean, default: true })
  success: boolean;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: true, type: Date, default: Date.now })
  processedAt: Date;

  @Prop({ required: false, type: Object })
  metadata?: {
    productId?: string;
    productName?: string;
    quantity?: number;
    returnReasonType?: string;
    cancelledOrdersCount?: number;
  };
}

export const ProcessedN11ClaimSchema =
  SchemaFactory.createForClass(ProcessedN11Claim);

ProcessedN11ClaimSchema.index({ orderNumber: 1, processedAt: -1 });
ProcessedN11ClaimSchema.index({ processedAt: -1 });

purifySchema(ProcessedN11ClaimSchema);
