jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { N11CronService } from '../n11/n11.cron.service';

function buildCron(isProduction: boolean) {
  const orders = {
    syncOrders: jest.fn<Promise<any>, any[]>(async () => ({
      skipped: false,
      created: 1,
      cancelled: 0,
    })),
    processAcceptedClaims: jest.fn<Promise<any>, any[]>(async () => ({
      stats: { cancelled: 2 },
    })),
  };
  const cron = new N11CronService({ isProduction } as never, orders as never);
  const logger = (cron as any).logger;
  const log = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  return { cron, orders, log, error };
}

describe('MarketplaceCron (n11)', () => {
  it('production dışında zamanlanmış işler çalışmaz', async () => {
    const { cron, orders } = buildCron(false);

    await cron.handleOrderSync();
    await cron.handleAcceptedClaims();

    expect(orders.syncOrders).not.toHaveBeenCalled();
    expect(orders.processAcceptedClaims).not.toHaveBeenCalled();
  });

  it('production da senkron ve iade işleme çalışır, sonuç loglanır', async () => {
    const { cron, log } = buildCron(true);

    await cron.handleOrderSync();
    await cron.handleAcceptedClaims();

    expect(log).toHaveBeenCalledWith(
      'n11 order sync: {"skipped":false,"created":1,"cancelled":0}',
    );
    expect(log).toHaveBeenCalledWith(
      'Completed scheduled task: Process n11 claims - Stats: {"cancelled":2}',
    );
  });

  it('değişiklik yoksa senkron sonucu loglanmaz', async () => {
    const { cron, orders, log } = buildCron(true);
    orders.syncOrders.mockResolvedValueOnce({ skipped: true });

    await cron.handleOrderSync();

    expect(log).not.toHaveBeenCalled();
  });

  it('hata yutulur, yalnızca mesaj loglanır', async () => {
    const { cron, orders, error } = buildCron(true);
    orders.syncOrders.mockRejectedValueOnce(new Error('down'));

    await expect(cron.handleOrderSync()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Error in scheduled task: n11 order sync: down',
    );
  });

  it('elle tetiklemede production kontrolü yapılmaz', async () => {
    const { cron, orders } = buildCron(false);

    await cron.triggerManualOrderSync();
    await cron.triggerManualClaimsProcessing();

    expect(orders.syncOrders).toHaveBeenCalled();
    expect(orders.processAcceptedClaims).toHaveBeenCalled();
  });
});
