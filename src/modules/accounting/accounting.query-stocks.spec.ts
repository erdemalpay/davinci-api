jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';

const stocks = [
  { _id: 'catan2', product: 'catan', location: 2, quantity: 5 },
  { _id: 'catan6', product: 'catan', location: 6, quantity: 3 },
  { _id: 'noir2', product: 'noir', location: 2, quantity: 1 },
];

const buildService = (history: any[]) => {
  const historyFilters: any[] = [];
  const service = new (AccountingService as any)();
  service.findAllStocks = jest.fn(async () => stocks.map((s) => ({ ...s })));
  service.stockModel = {
    find: jest.fn(async () => stocks.map((s) => ({ ...s }))),
  };
  service.productStockHistoryModel = {
    find: (filter: any) => {
      historyFilters.push(filter);
      return Object.assign(Promise.resolve(history), {
        select: () => ({ lean: async () => history }),
      });
    },
  };
  return { service, historyFilters };
};

describe('AccountingService.findQueryStocks', () => {
  it('returns the cached stock list when no date is given', async () => {
    const { service, historyFilters } = buildService([]);

    const result = await service.findQueryStocks({}, {});

    expect(result).toEqual(stocks);
    expect(service.findAllStocks).toHaveBeenCalledTimes(1);
    expect(service.stockModel.find).not.toHaveBeenCalled();
    expect(historyFilters).toEqual([]);
  });

  it('rolls each stock back by the changes made after the date', async () => {
    const { service, historyFilters } = buildService([
      { product: 'catan', location: 2, change: -2 },
      { product: 'catan', location: 2, change: 1 },
      { product: 'catan', location: 6, change: 4 },
    ]);

    const result = await service.findQueryStocks({}, { after: '2026-10-01' });

    expect(historyFilters).toEqual([
      { createdAt: { $gte: new Date('2026-10-01') } },
    ]);
    expect(result).toEqual([
      { _id: 'catan2', product: 'catan', location: 2, quantity: 6 },
      { _id: 'catan6', product: 'catan', location: 6, quantity: -1 },
      { _id: 'noir2', product: 'noir', location: 2, quantity: 1 },
    ]);
  });

  it('applies only the selected location history and still returns every stock', async () => {
    const { service, historyFilters } = buildService([
      { product: 'catan', location: 2, change: -2 },
    ]);

    const result = await service.findQueryStocks(
      {},
      { after: '2026-10-01', location: '2' },
    );

    expect(historyFilters).toEqual([
      { createdAt: { $gte: new Date('2026-10-01') }, location: 2 },
    ]);
    expect(result.map((s: any) => s.quantity)).toEqual([7, 3, 1]);
  });
});
