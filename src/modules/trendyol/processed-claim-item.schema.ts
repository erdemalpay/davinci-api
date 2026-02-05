import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

/**
 * İşlenmiş Trendyol iade taleplerini takip etmek için kullanılır.
 * Her claimItemId için yalnızca bir kez cancel işlemi yapılmasını sağlar (idempotency).
 */
@Schema({ timestamps: true })
export class ProcessedClaimItem extends Document {
  /**
   * Trendyol claim item'ın benzersiz ID'si
   * Bu, Trendyol API'sinden gelen claimItems[].id değeridir
   */
  @Prop({ required: true, type: String, unique: true })
  claimItemId: string;

  /**
   * Ana claim ID'si (tüm iade talebi)
   */
  @Prop({ required: true, type: String })
  claimId: string;

  /**
   * Trendyol sipariş numarası
   */
  @Prop({ required: true, type: String })
  orderNumber: string;

  /**
   * İşlem sırasındaki claim item status'u
   */
  @Prop({ required: true, type: String })
  statusAtProcess: string;

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
   * İşlem zamanı (timestamps ile otomatik oluşturulur ama explicit olarak da saklayabiliriz)
   */
  @Prop({ required: true, type: Date, default: Date.now })
  processedAt: Date;

  /**
   * Claim'in son değişiklik tarihi (Trendyol'dan gelen lastModifiedDate)
   */
  @Prop({ required: false, type: Date })
  lastModifiedDate?: Date;

  /**
   * İşlem detayları (debug ve raporlama için)
   */
  @Prop({ required: false, type: Object })
  metadata?: {
    acceptedItems?: Array<{
      claimItemId: string;
      barcode?: string;
      productName?: string;
      claimReason?: string;
      customerNote?: string;
    }>;
    cancelledOrdersCount?: number;
  };
}

export const ProcessedClaimItemSchema =
  SchemaFactory.createForClass(ProcessedClaimItem);

// Unique index - aynı claimItemId'yi tekrar işlememek için
ProcessedClaimItemSchema.index({ claimItemId: 1 }, { unique: true });

// Sorgular için ek index'ler
ProcessedClaimItemSchema.index({ orderNumber: 1, processedAt: -1 });
ProcessedClaimItemSchema.index({ claimId: 1 });
ProcessedClaimItemSchema.index({ processedAt: -1 });

purifySchema(ProcessedClaimItemSchema);
