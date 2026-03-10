import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

/**
 * İşlenmiş Hepsiburada iade taleplerini takip etmek için kullanılır.
 * Her claimNumber için yalnızca bir kez cancel işlemi yapılmasını sağlar (idempotency).
 */
@Schema({ timestamps: true })
export class ProcessedHepsiburadaClaim extends Document {
  /**
   * Hepsiburada claim numarası (unique identifier)
   */
  @Prop({ required: true, type: String, unique: true })
  claimNumber: string;

  /**
   * Hepsiburada sipariş numarası
   */
  @Prop({ required: true, type: String })
  orderNumber: string;

  /**
   * İşlem sırasındaki claim status'u
   */
  @Prop({ required: true, type: String })
  statusAtProcess: string;

  /**
   * Claim tipi (Return, RenewProduct, MissingItem, MissingPart)
   */
  @Prop({ required: false, type: String })
  claimType?: string;

  /**
   * Gerçekleştirilen işlem türü
   */
  @Prop({ required: true, type: String })
  action: string;

  /**
   * İşlem başarılı mı
   */
  @Prop({ required: true, type: Boolean, default: true })
  success: boolean;

  /**
   * Hata durumunda hata mesajı
   */
  @Prop({ required: false, type: String })
  errorMessage?: string;

  /**
   * İşlem zamanı
   */
  @Prop({ required: true, type: Date, default: Date.now })
  processedAt: Date;

  /**
   * Claim tarihi (Hepsiburada'dan gelen claimDate)
   */
  @Prop({ required: false, type: Date })
  claimDate?: Date;

  /**
   * İşlem detayları (debug ve raporlama için)
   */
  @Prop({ required: false, type: Object })
  metadata?: {
    claimType?: string;
    explanation?: string;
    quantity?: number;
    cancelledOrdersCount?: number;
  };
}

export const ProcessedHepsiburadaClaimSchema = SchemaFactory.createForClass(
  ProcessedHepsiburadaClaim,
);

// Unique index - aynı claimNumber'ı tekrar işlememek için
ProcessedHepsiburadaClaimSchema.index({ claimNumber: 1 }, { unique: true });

// Sorgular için ek index'ler
ProcessedHepsiburadaClaimSchema.index({ orderNumber: 1, processedAt: -1 });
ProcessedHepsiburadaClaimSchema.index({ processedAt: -1 });

purifySchema(ProcessedHepsiburadaClaimSchema);
