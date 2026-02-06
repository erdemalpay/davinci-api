import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrendyolService } from './trendyol.service';

/**
 * Trendyol ile ilgili periyodik zamanlanmış görevleri yürütür.
 *
 * Görevler:
 * - Kabul edilmiş (Accepted) iade taleplerini kontrol eder ve ilgili siparişleri iptal eder
 */
@Injectable()
export class TrendyolCronService {
  private readonly logger = new Logger(TrendyolCronService.name);

  constructor(private readonly trendyolService: TrendyolService) {}

  /**
   * Her 30 dakikada bir kabul edilmiş iade taleplerini kontrol eder.
   *
   * Çalışma sıklığı: Her 30 dakikada bir
   * İşlem: Trendyol'dan tüm claim'leri çeker, Accepted olanları bulur ve
   *        ilgili siparişleri iptal eder. İdempotency sağlanmıştır - aynı
   *        claim item birden fazla kez işlenmez.
   *
   * Çalışma zamanını değiştirmek için decorator'ı değiştirin:
   * CronExpression.EVERY_10_MINUTES - Her 10 dakika
   * CronExpression.EVERY_30_MINUTES - Her 30 dakika
   * CronExpression.EVERY_HOUR - Her saat
   * Veya custom cron expression kullanın
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAcceptedClaims() {
    this.logger.log('Starting scheduled task: Process accepted claims');

    try {
      const result = await this.trendyolService.processAcceptedClaims();

      if (result.stats.cancelled > 0) {
        this.logger.log(
          `Successfully cancelled ${result.stats.cancelled} orders from accepted claims`,
        );
      }

      if (result.stats.skipped > 0) {
        this.logger.log(
          `Skipped ${result.stats.skipped} already processed claim items`,
        );
      }

      if (result.stats.errors > 0) {
        this.logger.warn(
          `Encountered ${result.stats.errors} errors while processing claims`,
        );
      }

      this.logger.log(
        `Completed scheduled task: Process accepted claims - Stats: ${JSON.stringify(result.stats)}`,
      );
    } catch (error) {
      this.logger.error(
        'Error in scheduled task: Process accepted claims',
        error,
      );
    }
  }

  /**
   * Manuel olarak kabul edilmiş iade taleplerini işlemek için bu metodu çağırabilirsiniz.
   * Örnek kullanım: Controller'dan veya başka bir servis'ten.
   */
  async triggerManualClaimsProcessing() {
    this.logger.log('Manual trigger: Process accepted claims');
    return await this.handleAcceptedClaims();
  }
}
