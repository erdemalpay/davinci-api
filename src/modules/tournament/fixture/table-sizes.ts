// Masaları olabildiğince eşit dağıtır; en küçük masa minimumun altına düşerse
// tam dolu masalar kurulur ve artan oyuncular bay geçer.
export function planTableSizes(
  playerCount: number,
  tableSize: number,
  minTableSize: number,
): { sizes: number[]; byeCount: number } {
  if (playerCount < minTableSize) return { sizes: [], byeCount: playerCount };

  const tableCount = Math.ceil(playerCount / tableSize);
  const base = Math.floor(playerCount / tableCount);
  if (base >= minTableSize) {
    const extra = playerCount % tableCount;
    return {
      sizes: Array.from(
        { length: tableCount },
        (_, i) => base + (i < extra ? 1 : 0),
      ),
      byeCount: 0,
    };
  }

  const fullTables = Math.floor(playerCount / tableSize);
  return {
    sizes: Array(fullTables).fill(tableSize),
    byeCount: playerCount - fullTables * tableSize,
  };
}
