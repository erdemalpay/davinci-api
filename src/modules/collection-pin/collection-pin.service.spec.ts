jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class {},
}));

import {
  CollectionPinService,
  pinMoves,
  pinnedOrder,
} from './collection-pin.service';

// Applies collectionReorderProducts moves the way Shopify does: one by one.
function applyMoves(
  list: string[],
  moves: { id: string; newPosition: string }[],
) {
  const result = [...list];
  for (const move of moves) {
    result.splice(result.indexOf(move.id), 1);
    result.splice(Number(move.newPosition), 0, move.id);
  }
  return result;
}

describe('pinMoves', () => {
  const pinned = new Set(['d1', 'd2', 'd3']);

  it('moves pinned products to the top, keeping both orders', () => {
    const current = ['a', 'd2', 'b', 'c', 'd1', 'e', 'd3'];
    const moves = pinMoves(current, pinned);
    expect(applyMoves(current, moves)).toEqual([
      'd2',
      'd1',
      'd3',
      'a',
      'b',
      'c',
      'e',
    ]);
    expect(applyMoves(current, moves)).toEqual(pinnedOrder(current, pinned));
  });

  it('does nothing when they are already on top', () => {
    expect(pinMoves(['d3', 'd1', 'd2', 'a', 'b'], pinned)).toEqual([]);
  });

  it('handles a newly added game at the bottom', () => {
    const current = ['d1', 'd2', 'a', 'b', 'd3'];
    expect(applyMoves(current, pinMoves(current, pinned))).toEqual([
      'd1',
      'd2',
      'd3',
      'a',
      'b',
    ]);
  });

  it('ignores pinned products the collection does not have', () => {
    expect(pinMoves(['d1', 'a', 'b'], pinned)).toEqual([]);
    expect(pinMoves(['a', 'b'], pinned)).toEqual([]);
  });
});

describe('CollectionPinService', () => {
  const collection = (id: string, sortOrder: string, ids: string[]) => ({
    collectionByIdentifier: {
      id,
      title: id,
      sortOrder,
      products: {
        nodes: ids.map((x) => ({ id: x })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  });

  it('reorders only manual collections that need it', async () => {
    const adminGraphQL = jest.fn(async (query: string, vars: any) => {
      if (query.includes('collectionReorderProducts')) return {};
      switch (vars.handle) {
        case 'da-vinci-oyunlari':
          return collection('src', 'MANUAL', ['d1', 'd2']);
        case 'kutu-oyunu':
          return collection('k', 'MANUAL', ['a', 'd2', 'd1']);
        case 'turkce-oyunlar':
          return collection('t', 'MANUAL', ['d1', 'd2', 'a']);
      }
    });
    const service = new CollectionPinService({ adminGraphQL } as any);

    expect(await service.pinDaVinciGames()).toEqual([
      { handle: 'kutu-oyunu', status: 'reordered', moved: 2 },
      { handle: 'turkce-oyunlar', status: 'unchanged' },
    ]);
    const reorder = adminGraphQL.mock.calls.filter(([q]) =>
      q.includes('collectionReorderProducts'),
    );
    expect(reorder).toHaveLength(1);
    expect(reorder[0][1]).toEqual({
      id: 'k',
      moves: [
        { id: 'd2', newPosition: '0' },
        { id: 'd1', newPosition: '1' },
      ],
    });
  });

  it('leaves a collection with another sort order alone', async () => {
    const adminGraphQL = jest.fn(async (query: string, vars: any) =>
      vars.handle === 'da-vinci-oyunlari'
        ? collection('src', 'MANUAL', ['d1'])
        : collection(vars.handle, 'BEST_SELLING', ['a', 'd1']),
    );
    const service = new CollectionPinService({ adminGraphQL } as any);
    const results = await service.pinDaVinciGames();
    expect(results.map((r) => r.status)).toEqual(['not-manual', 'not-manual']);
    expect(adminGraphQL).toHaveBeenCalledTimes(3);
  });
});
