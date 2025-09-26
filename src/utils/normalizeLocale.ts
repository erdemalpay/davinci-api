export function normalizeLocale(lang?: string): string | undefined {
  if (!lang) return undefined;
  const v = lang.replace('_', '-').toLowerCase(); // en_en -> en-en
  const base = v.split('-')[0];                   // en-en -> en
  return base;
}