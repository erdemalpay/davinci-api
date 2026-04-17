/**
 * Ek menü kategorileri: birincil kategori ile çakışmayı ve mükerrer ID'leri temizler.
 */
export function normalizeAdditionalCategories(
  primaryCategoryId: number,
  additional: number[] | undefined | null,
): number[] {
  if (!additional?.length) {
    return [];
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of additional) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id === primaryCategoryId) {
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}
