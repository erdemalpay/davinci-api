import { planTableSizes } from './table-sizes';
import { RankedTableEntry, TableAssignment } from './types';

// Güçlü oyuncuları masalara yayar: 8 kişi / 2 masa → 1-4-5-8 ve 2-3-6-7.
export function seedEliminationTables(
  rankedIds: number[],
  tableSize: number,
): TableAssignment[] {
  if (rankedIds.length < 2) return [];
  const { sizes } = planTableSizes(rankedIds.length, tableSize, 2);
  const tables: number[][] = sizes.map(() => []);

  const snake: number[] = [];
  while (snake.length < rankedIds.length * 2) {
    for (let i = 0; i < sizes.length; i++) snake.push(i);
    for (let i = sizes.length - 1; i >= 0; i--) snake.push(i);
  }

  let cursor = 0;
  for (const id of rankedIds) {
    while (tables[snake[cursor]].length >= sizes[snake[cursor]]) cursor++;
    tables[snake[cursor]].push(id);
    cursor++;
  }

  return tables.map((participantIds, i) => ({
    tableNo: i + 1,
    participantIds,
  }));
}

// Her masadan ilk `advancePerTable` kişi çıkar; sıra: tüm birinciler, sonra ikinciler...
// Bu sıra bir sonraki turun yılan dağıtımında seed olarak kullanılır.
export function pickAdvancers(
  rankedTables: RankedTableEntry[][],
  advancePerTable: number,
): number[] {
  const result: number[] = [];
  for (let place = 0; place < advancePerTable; place++)
    for (const table of rankedTables) {
      const entry = table[place];
      if (entry) result.push(entry.participantId);
    }
  return result;
}
