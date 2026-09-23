import { PlayedMatch, StandingRow } from './types';

// Sıralama: toplam puan → rakiplerin ortalama puanı (BGA'daki gibi) → id.
export function computeStandings(
  participantIds: number[],
  matches: PlayedMatch[],
): StandingRow[] {
  const rows = new Map(
    participantIds.map((id) => [
      id,
      {
        participantId: id,
        points: 0,
        matchesPlayed: 0,
        byeCount: 0,
        opponents: [] as number[],
      },
    ]),
  );

  for (const match of matches) {
    for (const player of match.players) {
      const row = rows.get(player.participantId);
      if (!row) continue;
      row.points += player.points;
      if (match.isBye) {
        row.byeCount++;
        continue;
      }
      row.matchesPlayed++;
      row.opponents.push(
        ...match.players
          .filter((p) => p.participantId !== player.participantId)
          .map((p) => p.participantId),
      );
    }
  }

  const result = [...rows.values()].map((row) => {
    const opponentPoints = row.opponents.map((id) => rows.get(id)?.points ?? 0);
    const avg = opponentPoints.length
      ? opponentPoints.reduce((sum, v) => sum + v, 0) / opponentPoints.length
      : 0;
    return {
      participantId: row.participantId,
      points: row.points,
      matchesPlayed: row.matchesPlayed,
      byeCount: row.byeCount,
      avgOpponentPoints: Math.round(avg * 100) / 100,
    };
  });

  result.sort(
    (a, b) =>
      b.points - a.points ||
      b.avgOpponentPoints - a.avgOpponentPoints ||
      a.participantId - b.participantId,
  );
  return result.map((row, i) => ({ ...row, rank: i + 1 }));
}
