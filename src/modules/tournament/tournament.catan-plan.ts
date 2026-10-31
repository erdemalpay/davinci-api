import { CATAN_OFFICIAL_PLANS } from './tournament.catan-official-plans';
import { shuffle, TableAssignment } from './tournament.fixture';

export const CATAN_PLAN_ROUNDS = 3;
export const CATAN_PLAN_MIN_PLAYERS = 29;
export const CATAN_PLAN_MAX_PLAYERS = 64;

// Alman Catan şampiyonası "Spielplan 61-64 Spieler*innen" (2024). [tur][masa][sıra] = oyuncu numarası.
// Hiçbir çift iki kez karşılaşmaz, herkes 3 farklı başlangıç sırası alır; 49-64 numaraları
// hiçbir turda aynı masaya düşmez (bu yüzden boş kalan numaralar en büyükler olmalıdır).
// prettier-ignore
export const CATAN_PLAN_64: number[][][] = [
  [
    [16, 32, 48, 55], [15, 31, 47, 60], [14, 30, 46, 56], [13, 29, 45, 51],
    [12, 28, 44, 59], [11, 27, 43, 64], [10, 26, 42, 52], [9, 25, 41, 49],
    [8, 24, 40, 63], [7, 23, 39, 50], [6, 22, 38, 58], [5, 21, 37, 53],
    [4, 20, 36, 54], [3, 19, 35, 57], [2, 18, 34, 61], [1, 17, 33, 62],
  ],
  [
    [49, 16, 17, 34], [59, 15, 32, 33], [61, 14, 31, 48], [58, 13, 30, 47],
    [54, 12, 29, 46], [53, 11, 28, 45], [51, 10, 27, 44], [56, 9, 26, 43],
    [57, 8, 25, 42], [52, 7, 24, 41], [55, 6, 23, 40], [62, 5, 22, 39],
    [50, 4, 21, 38], [63, 3, 20, 37], [64, 2, 19, 36], [60, 1, 18, 35],
  ],
  [
    [36, 58, 16, 18], [35, 56, 15, 17], [34, 64, 14, 32], [33, 49, 13, 31],
    [48, 62, 12, 30], [47, 59, 11, 29], [46, 63, 10, 28], [45, 52, 9, 27],
    [44, 50, 8, 26], [43, 61, 7, 25], [42, 53, 6, 24], [41, 57, 5, 23],
    [40, 60, 4, 22], [39, 51, 3, 21], [38, 55, 2, 20], [37, 54, 1, 19],
  ],
];

// Plan, katılımcı sayısına göre seçilir: Alman şampiyonasının resmi planları 4'er kişilik
// aralıklarla hazırdır (29-32, 33-36, ... 61-64) ve aralığın en büyük sayısı için yazılmıştır;
// gelmeyen en büyük numaraların koltuğu boş kalır. Sayı olarak ilk çekilişteki oyuncu sayısı ya
// da verilmiş en büyük numara verilir.
export const catanPlanSize = (players: number) =>
  players > 48
    ? CATAN_PLAN_MAX_PLAYERS
    : Math.max(32, Math.ceil(players / 4) * 4);

export const catanPlanFor = (size: number): number[][][] =>
  size === CATAN_PLAN_MAX_PLAYERS ? CATAN_PLAN_64 : CATAN_OFFICIAL_PLANS[size];

export interface CatanPlanSlot {
  round: number;
  tableNo: number;
  seat: number;
}

// Bir numaranın 3 turdaki masası ve başlangıç sırası
export const catanSchedule = (
  drawNumber: number,
  plan: number[][][] = CATAN_PLAN_64,
): CatanPlanSlot[] => {
  if (drawNumber < 1 || drawNumber > plan[0].flat().length) return [];
  return plan.map((tables, roundIndex) => {
    const tableIndex = tables.findIndex((numbers) =>
      numbers.includes(drawNumber),
    );
    return {
      round: roundIndex + 1,
      tableNo: tableIndex + 1,
      seat: tables[tableIndex].indexOf(drawNumber) + 1,
    };
  });
};

// Numarası olmayanlar karıştırılıp boş numaraların küçüğünden başlayarak dağıtılır:
// ilk çekilişte 1..N alınır (boş kalanlar en büyükler), geç gelen en küçük boş numarayı alır.
// Numaralar planın büyüklüğünü aşamaz; plan ilk çekilişte seçilir ve sonradan değişmez.
export function assignDrawNumbers(
  takenNumbers: Iterable<number>,
  participantIds: number[],
  random: () => number = Math.random,
): Map<number, number> {
  const taken = new Set(takenNumbers);
  const size = catanPlanSize(
    taken.size ? Math.max(...taken) : participantIds.length,
  );
  const free = Array.from({ length: size }, (_, i) => i + 1).filter(
    (number) => !taken.has(number),
  );
  if (participantIds.length > free.length)
    throw new RangeError('Boş numara kalmadı');
  return new Map(shuffle(participantIds, random).map((id, i) => [id, free[i]]));
}

// Planın bir turunu katılımcılara çevirir. Gelmeyen numaranın koltuğu atlanır (masa küçülür),
// hiç oyuncusu olmayan masa yazılmaz; masa numaraları planınkiyle aynı kalır.
export function planCatanRound(
  round: number,
  participantByNumber: Map<number, number>,
  plan: number[][][],
): TableAssignment[] {
  const tables = plan[round - 1] ?? [];
  return tables.flatMap((numbers, tableIndex) => {
    const seated = numbers.flatMap((number, seatIndex) => {
      const participantId = participantByNumber.get(number);
      return participantId === undefined
        ? []
        : [{ participantId, seat: seatIndex + 1 }];
    });
    return seated.length
      ? [
          {
            tableNo: tableIndex + 1,
            participantIds: seated.map((s) => s.participantId),
            seats: seated.map((s) => s.seat),
          },
        ]
      : [];
  });
}
