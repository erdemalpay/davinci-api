import { RankedTableEntry, TableScore } from './types';

// Aynı skor aynı sırayı alır (50, 50, 5 → 1., 1., 3.).
export function rankTable(
  scores: TableScore[],
  placementPoints: number[],
): RankedTableEntry[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((entry) => {
    const rank = sorted.findIndex((other) => other.score === entry.score) + 1;
    return { ...entry, rank, points: placementPoints[rank - 1] ?? 0 };
  });
}
