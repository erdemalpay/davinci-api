import { planTableSizes } from './table-sizes';
import { RoundPairing } from './types';

export interface PairRoundInput {
  rankedIds: number[]; // en iyiden en kötüye; 1. turda karıştırılmış liste
  tableSize: number;
  minTableSize: number;
  previousOpponents: Map<number, Set<number>>;
  previousByes: Set<number>;
}

export function selectByes(
  rankedIds: number[],
  byeCount: number,
  previousByes: Set<number>,
): number[] {
  const fromBottom = [...rankedIds].reverse();
  const fresh = fromBottom.filter((id) => !previousByes.has(id));
  const repeated = fromBottom.filter((id) => previousByes.has(id));
  return [...fresh, ...repeated].slice(0, byeCount);
}

export function countRematches(
  ids: number[],
  previousOpponents: Map<number, Set<number>>,
): number {
  let count = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (previousOpponents.get(ids[i])?.has(ids[j])) count++;
  return count;
}

// Komşu masalar arasında tek oyuncu takaslayarak tekrar eşleşmeleri azaltır.
// Sadece komşu masalarla takas yapılır ki puan sırası bozulmasın.
function reduceRematches(
  tables: number[][],
  previousOpponents: Map<number, Set<number>>,
) {
  let improved = true;
  let guard = 0;
  while (improved && guard < 100) {
    improved = false;
    guard++;
    for (let t = 0; t < tables.length - 1; t++) {
      const a = tables[t];
      const b = tables[t + 1];
      const before =
        countRematches(a, previousOpponents) +
        countRematches(b, previousOpponents);
      if (before === 0) continue;
      search: for (let i = a.length - 1; i >= 0; i--) {
        for (let j = 0; j < b.length; j++) {
          const nextA = [...a];
          const nextB = [...b];
          [nextA[i], nextB[j]] = [nextB[j], nextA[i]];
          const after =
            countRematches(nextA, previousOpponents) +
            countRematches(nextB, previousOpponents);
          if (after < before) {
            tables[t] = nextA;
            tables[t + 1] = nextB;
            improved = true;
            break search;
          }
        }
      }
    }
  }
}

export function pairRound(input: PairRoundInput): RoundPairing {
  const { sizes, byeCount } = planTableSizes(
    input.rankedIds.length,
    input.tableSize,
    input.minTableSize,
  );
  const byes = selectByes(input.rankedIds, byeCount, input.previousByes);
  const byeSet = new Set(byes);
  const seated = input.rankedIds.filter((id) => !byeSet.has(id));

  const tables: number[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    tables.push(seated.slice(cursor, cursor + size));
    cursor += size;
  }
  reduceRematches(tables, input.previousOpponents);

  return {
    tables: tables.map((participantIds, i) => ({
      tableNo: i + 1,
      participantIds,
    })),
    byes,
  };
}
