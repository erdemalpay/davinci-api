export interface TableAssignment {
  tableNo: number;
  participantIds: number[];
}

export interface RoundPairing {
  tables: TableAssignment[];
  byes: number[];
}

export interface TableScore {
  participantId: number;
  score: number;
}

export interface RankedTableEntry extends TableScore {
  rank: number;
  points: number;
}

export interface PlayedMatch {
  isBye: boolean;
  players: { participantId: number; points: number }[];
}

export interface StandingRow {
  participantId: number;
  rank: number;
  points: number;
  matchesPlayed: number;
  byeCount: number;
  avgOpponentPoints: number;
}
