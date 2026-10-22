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
