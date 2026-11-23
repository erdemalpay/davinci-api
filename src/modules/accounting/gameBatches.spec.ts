import 'reflect-metadata';
import { StockHistoryStatusEnum as S } from './accounting.dto';
import { computeGameBatches, GameStockEvent } from './gameBatches';

let nextId = 1;
const at = (day: string, hour = 12) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`);
const ev = (
  day: string,
  change: number,
  status: string,
  extra: Partial<GameStockEvent> = {},
): GameStockEvent => ({
  _id: nextId++,
  change,
  status,
  createdAt: at(day),
  ...extra,
});
const now = at('2026-03-01');

describe('computeGameBatches', () => {
  it('ends a batch when its games leave the depot, transfers included', () => {
    const [batch] = computeGameBatches(
      'game',
      [
        ev('2026-01-01', 30, S.EXPENSEENTRY),
        ev('2026-01-03', -25, S.SHOPIFYORDERCREATE),
        ev('2026-01-05', -5, S.STOCKTRANSFER, { transferLocation: 7 }),
      ],
      now,
    );
    expect(batch).toMatchObject({
      purchasedQuantity: 30,
      soldQuantity: 25,
      transferredQuantity: 5,
      transfers: [{ location: 7, quantity: 5 }],
      remainingQuantity: 0,
      isActive: false,
      sellStartDate: '2026-01-03',
      endDate: '2026-01-05',
      duration: 2,
      duration90: 2,
    });
  });

  it('starts the next batch only after the previous one is used up', () => {
    const batches = computeGameBatches(
      'game',
      [
        ev('2026-01-01', 10, S.EXPENSEENTRY),
        ev('2026-01-02', -4, S.ORDERCREATE),
        ev('2026-01-05', 10, S.EXPENSEENTRY),
        ev('2026-01-10', -6, S.ORDERCREATE),
        ev('2026-01-20', -10, S.ORDERCREATE),
      ],
      now,
    );
    expect(batches.map((b) => [b.sellStartDate, b.endDate])).toEqual([
      ['2026-01-02', '2026-01-10'],
      ['2026-01-20', '2026-01-20'],
    ]);
    expect(batches[1].shelfDuration).toBe(15);
  });

  it('merges same-day arrivals and does not open batches for cancels', () => {
    const batches = computeGameBatches(
      'game',
      [
        ev('2026-01-01', 5, S.EXPENSEENTRY),
        ev('2026-01-01', 5, S.STOCKENTRY),
        ev('2026-01-02', -10, S.SHOPIFYORDERCREATE),
        ev('2026-01-03', 1, S.SHOPIFYORDERCANCEL),
        ev('2026-01-04', -1, S.SHOPIFYORDERCREATE),
      ],
      now,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      purchasedQuantity: 10,
      soldQuantity: 10,
      remainingQuantity: 0,
      endDate: '2026-01-02',
    });
  });

  it('reads an expense edit as a change of its batch, not a sale', () => {
    const batches = computeGameBatches(
      'game',
      [
        ev('2026-01-01', 20, S.EXPENSEENTRY),
        ev('2026-01-02', -5, S.ORDERCREATE),
        ev('2026-01-03', -20, S.EXPENSEUPDATEDELETE),
        ev('2026-01-03', 25, S.EXPENSEUPDATEENTRY),
      ],
      now,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      purchasedQuantity: 25,
      soldQuantity: 5,
      otherOutQuantity: 0,
      remainingQuantity: 20,
      isActive: true,
    });
  });

  it('drops a batch whose expense was deleted', () => {
    const batches = computeGameBatches(
      'game',
      [
        ev('2026-01-01', 20, S.EXPENSEENTRY),
        ev('2026-01-02', -20, S.EXPENSEDELETE),
      ],
      now,
    );
    expect(batches).toHaveLength(0);
  });

  it('gives sales recorded before the arrival to the arriving batch', () => {
    const [batch] = computeGameBatches(
      'game',
      [
        ev('2026-01-01', -2, S.SHOPIFYORDERCREATE),
        ev('2026-01-03', 10, S.EXPENSEENTRY),
      ],
      now,
    );
    expect(batch).toMatchObject({
      soldQuantity: 2,
      remainingQuantity: 8,
      sellStartDate: '2026-01-03',
    });
  });
});
