import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HepsiburadaService } from './hepsiburada.service';

/**
 * Hepsiburada ile ilgili periyodik zamanlanmış görevleri yürütür.
 *
 * Görevler:
 * - İade (Return) taleplerini kontrol eder ve ilgili siparişleri iptal eder
 */
@Injectable()
export class HepsiburadaCronService {
  private readonly logger = new Logger(HepsiburadaCronService.name);

  constructor(private readonly hepsiburadaService: HepsiburadaService) {}

  /**
   * Her 30 dakikada bir Hepsiburada iade taleplerini kontrol eder.
   *
   * Çalışma sıklığı: Her 30 dakikada bir
   * İşlem: Hepsiburada'dan tüm claim'leri çeker, Return tipinde olanları bulur ve
   *        ilgili siparişleri iptal eder. İdempotency sağlanmıştır - aynı
   *        claimNumber birden fazla kez işlenmez.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAcceptedClaims() {
    this.logger.log(
      'Starting scheduled task: Process Hepsiburada accepted claims',
    );

    try {
      const result = await this.hepsiburadaService.processAcceptedClaims();

      if (result.stats.cancelled > 0) {
        this.logger.log(
          `Successfully cancelled ${result.stats.cancelled} orders from Hepsiburada claims`,
        );
      }

      if (result.stats.skipped > 0) {
        this.logger.log(
          `Skipped ${result.stats.skipped} already processed Hepsiburada claims`,
        );
      }

      if (result.stats.errors > 0) {
        this.logger.warn(
          `Encountered ${result.stats.errors} errors while processing Hepsiburada claims`,
        );
      }

      this.logger.log(
        `Completed scheduled task: Process Hepsiburada claims - Stats: ${JSON.stringify(result.stats)}`,
      );
    } catch (error) {
      this.logger.error(
        'Error in scheduled task: Process Hepsiburada accepted claims',
        error,
      );
    }
  }

  /**
   * Manuel olarak Hepsiburada iade taleplerini işlemek için bu metodu çağırabilirsiniz.
   * Örnek kullanım: Controller'dan veya başka bir servis'ten.
   */
  async triggerManualClaimsProcessing() {
    this.logger.log('Manual trigger: Process Hepsiburada accepted claims');
    return await this.handleAcceptedClaims();
  }
}
