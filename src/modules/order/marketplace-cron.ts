import { Logger } from '@nestjs/common';

type MarketplaceOrders = {
  syncOrders(): Promise<
    { skipped: true } | { skipped: false; created: number; cancelled: number }
  >;
  processAcceptedClaims(): Promise<{ stats: unknown }>;
};

// Polling ile çalışan pazaryerlerinin (n11, idefix) zamanlanmış işleri.
// @Cron dekoratörleri alt sınıfta kalır; işler yalnızca production'da çalışır.
export abstract class MarketplaceCron {
  protected readonly logger = new Logger(this.constructor.name);
  protected abstract readonly label: string;

  constructor(
    private readonly client: { isProduction: boolean },
    private readonly orders: MarketplaceOrders,
  ) {}

  protected async runOrderSync() {
    if (!this.client.isProduction) return;
    try {
      const result = await this.orders.syncOrders();
      if ('created' in result && (result.created > 0 || result.cancelled > 0)) {
        this.logger.log(`${this.label} order sync: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      // Ham hata kimlik bilgisi taşıyan header'ları içerebilir; yalnızca mesaj loglanır.
      this.logger.error(
        `Error in scheduled task: ${this.label} order sync: ${error?.message}`,
      );
    }
  }

  protected async runClaimsProcessing() {
    if (!this.client.isProduction) return;
    try {
      const result = await this.orders.processAcceptedClaims();
      this.logger.log(
        `Completed scheduled task: Process ${
          this.label
        } claims - Stats: ${JSON.stringify(result.stats)}`,
      );
    } catch (error) {
      this.logger.error(
        `Error in scheduled task: Process ${this.label} claims: ${error?.message}`,
      );
    }
  }

  triggerManualOrderSync() {
    this.logger.log(`Manual trigger: ${this.label} order sync`);
    return this.orders.syncOrders();
  }

  triggerManualClaimsProcessing() {
    this.logger.log(`Manual trigger: Process ${this.label} claims`);
    return this.orders.processAcceptedClaims();
  }
}
