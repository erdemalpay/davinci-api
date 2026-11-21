jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { TableTypes } from './table.dto';
import { TableService } from './table.service';

describe('TableService finishing the games still going on', () => {
  // Gameplays 1-3 are going on at the activity table's tables 27, 36 and 26.
  const open = [
    { _id: 1, activityTableName: '27' },
    { _id: 2, activityTableName: '36' },
    { _id: 3, activityTableName: '26' },
  ];

  function build() {
    const gameplayService = {
      findOpenByIds: jest.fn(async (ids: number[]) =>
        open.filter((gameplay) => ids.includes(gameplay._id)),
      ),
      close: jest.fn(),
    };
    const gameplayTimeService = { finishByGameplay: jest.fn() };
    const service = Object.assign(Object.create(TableService.prototype), {
      gameplayService,
      gameplayTimeService,
    });
    const finish = (table: unknown, forTable?: string | null) =>
      (
        service as {
          finishOpenGameplays: (
            user: unknown,
            table: unknown,
            finishHour: string,
            forTable?: string | null,
          ) => Promise<void>;
        }
      ).finishOpenGameplays({ _id: 'kemal' }, table, '18:57', forTable);
    const finished = () =>
      gameplayService.close.mock.calls.map(([, id]) => id as number);
    return { finish, finished, gameplayTimeService };
  }

  const activityTable = { type: TableTypes.ACTIVITY, gameplays: [1, 2, 3] };

  it("ends only the game at the new game's own table of an activity table", async () => {
    const { finish, finished, gameplayTimeService } = build();

    await finish(activityTable, '26');

    expect(finished()).toEqual([3]);
    expect(gameplayTimeService.finishByGameplay).toHaveBeenCalledWith(
      3,
      '18:57',
    );
  });

  it('ends every game when the activity table closes', async () => {
    const { finish, finished } = build();

    await finish(activityTable);

    expect(finished()).toEqual([1, 2, 3]);
  });

  it('ends the previous game of an ordinary table', async () => {
    const { finish, finished, gameplayTimeService } = build();

    await finish({ type: TableTypes.NORMAL, gameplays: [1, 2] }, null);

    expect(finished()).toEqual([2]);
    expect(gameplayTimeService.finishByGameplay).toHaveBeenCalledWith(
      2,
      '18:57',
    );
  });
});

describe('TableService adding a game', () => {
  function build(table: Record<string, unknown>) {
    const gameplay = { _id: 99 };
    const saved: number[][] = [];
    const tableDoc = {
      _id: 7,
      location: 1,
      date: '2026-10-30',
      name: '12',
      gameplays: [] as unknown[],
      playerCount: 0,
      ...table,
      save: jest.fn(async function (this: { gameplays: unknown[] }) {
        saved.push(
          [...(this.gameplays as { _id: number }[])].map((g) => g._id),
        );
      }),
    };
    const orderService = { createOrder: jest.fn() };
    const service = Object.assign(Object.create(TableService.prototype), {
      tableModel: { findById: jest.fn(async () => tableDoc) },
      gameplayService: {
        create: jest.fn(async () => gameplay),
        findOpenByIds: jest.fn(async () => []),
        close: jest.fn(),
      },
      gameplayTimeService: { create: jest.fn(), finishByGameplay: jest.fn() },
      activityService: { addActivity: jest.fn() },
      eventEmitter: { emit: jest.fn() },
      panelControlService: { isWeekend: jest.fn(async () => false) },
      menuService: {
        findItemById: jest.fn(async () => ({
          _id: 113,
          price: 150,
          category: 4,
        })),
        findCategoryById: jest.fn(async () => ({ kitchen: 'bar' })),
      },
      orderService,
    });
    const add = (dto: Record<string, unknown>) =>
      (
        service as {
          addGameplay: (
            user: unknown,
            id: number,
            dto: unknown,
          ) => Promise<unknown>;
        }
      ).addGameplay({ _id: 'utku' }, 7, {
        startHour: '18:30',
        mentor: 'utku',
        isAutoEntry: true,
        playerCount: 4,
        ...dto,
      });
    return { add, tableDoc, orderService, saved };
  }

  it('adds no entry order on an activity table and still keeps the game', async () => {
    const { add, tableDoc, orderService, saved } = build({
      type: TableTypes.ACTIVITY,
      playerCount: 0,
    });

    await add({ activityTableName: '23' });

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(saved).toEqual([[99]]);
    expect(tableDoc.playerCount).toBe(0);
  });

  it('keeps the game on the table even when the entry order fails', async () => {
    const { add, orderService, saved } = build({
      type: TableTypes.NORMAL,
      playerCount: 2,
    });
    orderService.createOrder.mockRejectedValue(new Error('order failed'));

    await expect(add({})).rejects.toThrow('order failed');

    expect(saved).toEqual([[99]]);
  });

  it('adds the entry order for the new players on an ordinary table', async () => {
    const { add, tableDoc, orderService } = build({
      type: TableTypes.NORMAL,
      playerCount: 2,
    });

    await add({});

    expect(orderService.createOrder).toHaveBeenCalledWith(
      { _id: 'utku' },
      expect.objectContaining({ table: 7, item: 113, quantity: 2 }),
    );
    expect(tableDoc.playerCount).toBe(4);
  });

  it('adds no entry order without automatic entry', async () => {
    const { add, orderService } = build({
      type: TableTypes.NORMAL,
      playerCount: 2,
    });

    await add({ isAutoEntry: false });

    expect(orderService.createOrder).not.toHaveBeenCalled();
  });
});
