import {
  assignDrawNumbers,
  CATAN_PLAN_64,
  catanSchedule,
  planCatanRound,
} from './tournament.catan-plan';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
// numara → katılımcı kimliği (kimlik = numara + 1000)
const byNumber = (count: number) =>
  new Map(numbers(count).map((n) => [n, n + 1000]));

describe('CATAN_PLAN_64 bütünlüğü', () => {
  it('3 tur, her turda 16 masa ve masada 4 sıra var', () => {
    expect(CATAN_PLAN_64).toHaveLength(3);
    CATAN_PLAN_64.forEach((round) => {
      expect(round).toHaveLength(16);
      round.forEach((table) => expect(table).toHaveLength(4));
    });
  });

  it('her turda 1-64 numaraları birer kez geçer', () => {
    CATAN_PLAN_64.forEach((round) =>
      expect([...round.flat()].sort((a, b) => a - b)).toEqual(numbers(64)),
    );
  });

  it('hiçbir oyuncu çifti iki kez aynı masaya düşmez', () => {
    const seen = new Set<string>();
    CATAN_PLAN_64.forEach((round) =>
      round.forEach((table) =>
        table.forEach((a) =>
          table.forEach((b) => {
            if (a >= b) return;
            const key = `${a}-${b}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }),
        ),
      ),
    );
    expect(seen.size).toBe(288);
  });

  it('her oyuncu 3 turda 3 farklı başlangıç sırası alır', () => {
    numbers(64).forEach((n) => {
      const seats = catanSchedule(n).map((slot) => slot.seat);
      expect(new Set(seats).size).toBe(3);
    });
  });

  it('49-64 numaraları hiçbir turda aynı masada değildir', () => {
    CATAN_PLAN_64.forEach((round) =>
      round.forEach((table) =>
        expect(table.filter((n) => n >= 49).length).toBeLessThanOrEqual(1),
      ),
    );
  });
});

describe('catanSchedule', () => {
  it('64 numaralı oyuncunun üç turunu verir', () => {
    expect(catanSchedule(64)).toEqual([
      { round: 1, tableNo: 6, seat: 4 },
      { round: 2, tableNo: 15, seat: 1 },
      { round: 3, tableNo: 3, seat: 2 },
    ]);
  });

  it('1 numaralı oyuncu hep masa 16 ve sırayla 1., 2., 3. sırada oturur', () => {
    expect(catanSchedule(1)).toEqual([
      { round: 1, tableNo: 16, seat: 1 },
      { round: 2, tableNo: 16, seat: 2 },
      { round: 3, tableNo: 16, seat: 3 },
    ]);
  });

  it('plan dışı numara için boş döner', () => {
    expect(catanSchedule(0)).toEqual([]);
    expect(catanSchedule(65)).toEqual([]);
  });
});

describe('assignDrawNumbers', () => {
  it('62 kişiye 1-62 numaralarını rastgele dağıtır, boşlar en büyükler kalır', () => {
    const ids = numbers(62).map((n) => n + 500);
    const result = assignDrawNumbers([], ids, seeded(7));
    expect([...result.values()].sort((a, b) => a - b)).toEqual(numbers(62));
    expect([...result.keys()].sort((a, b) => a - b)).toEqual(ids);
  });

  it('aynı tohumla aynı çekilişi verir, farklı tohumla farklı', () => {
    const ids = numbers(40);
    expect([...assignDrawNumbers([], ids, seeded(1))]).toEqual([
      ...assignDrawNumbers([], ids, seeded(1)),
    ]);
    expect([...assignDrawNumbers([], ids, seeded(1))]).not.toEqual([
      ...assignDrawNumbers([], ids, seeded(2)),
    ]);
  });

  it('geç gelen alınmış numaraları atlayıp en küçük boş numarayı alır', () => {
    const result = assignDrawNumbers([1, 2, 4], [900], seeded(3));
    expect(result.get(900)).toBe(3);
  });

  it('boş numara kalmadıysa hata verir', () => {
    expect(() => assignDrawNumbers(numbers(64), [901], seeded(1))).toThrow(
      RangeError,
    );
  });
});

describe('planCatanRound', () => {
  it('64 kişide 16 masa, hepsi 4 kişilik; masa ve sıra planla aynı', () => {
    const tables = planCatanRound(1, byNumber(64));
    expect(tables).toHaveLength(16);
    tables.forEach((t) => expect(t.participantIds).toHaveLength(4));
    expect(tables[0]).toEqual({
      tableNo: 1,
      participantIds: [1016, 1032, 1048, 1055],
      seats: [1, 2, 3, 4],
    });
  });

  it('62 kişide (63, 64 boş) 3 kişilik masalar planın söylediği yerlerde', () => {
    const smallTables = (round: number) =>
      planCatanRound(round, byNumber(62))
        .filter((t) => t.participantIds.length === 3)
        .map((t) => t.tableNo);
    expect(smallTables(1)).toEqual([6, 9]);
    expect(smallTables(2)).toEqual([14, 15]);
    expect(smallTables(3)).toEqual([3, 7]);
  });

  it('gelmeyen numaranın koltuğunu atlar, diğerlerinin sırası değişmez', () => {
    const tables = planCatanRound(1, byNumber(62));
    expect(tables.find((t) => t.tableNo === 6)).toEqual({
      tableNo: 6,
      participantIds: [1011, 1027, 1043],
      seats: [1, 2, 3],
    });
  });

  it('49-64 arası her katılımcı sayısında hiçbir masa 3 kişiden az olmaz', () => {
    for (let count = 49; count <= 64; count++)
      [1, 2, 3].forEach((round) =>
        planCatanRound(round, byNumber(count)).forEach((t) =>
          expect(t.participantIds.length).toBeGreaterThanOrEqual(3),
        ),
      );
  });

  it('tamamen boş kalan masa yazılmaz', () => {
    const only = new Map([[1, 1001]]);
    expect(planCatanRound(1, only)).toEqual([
      { tableNo: 16, participantIds: [1001], seats: [1] },
    ]);
  });
});
