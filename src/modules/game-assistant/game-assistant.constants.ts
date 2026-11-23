// Oyun asistanının sabitleri. Model değişikliği yalnızca GAME_ASSISTANT_MODEL ile yapılır.

export const GAME_ASSISTANT_MODEL = 'claude-haiku-5-5';

// Liste fiyatları, milyon token başına USD (2026-11). Bütçe hesabında cache okumaları
// da tam girdi fiyatından sayılır: tahmin bilerek yukarı yuvarlanır.
export const MODEL_PRICES_USD_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

export const GAME_ASSISTANT_LIMITS = {
  maxMessageChars: 300,
  maxMessages: 10,
  maxShownGames: 20,
  maxToolCalls: 4,
  maxShowGames: 5,
  maxReplyChars: 600,
  maxSearchResults: 15,
  maxSimilarResults: 10,
  clientMessagesPerHour: 30,
  ipMessagesPerHour: 300,
  llmTimeoutMs: 10_000,
  llmMaxTokens: 2048,
  catalogCacheSeconds: 600,
  popularityWindowDays: 365,
};

export const DEFAULT_DAILY_BUDGET_USD = 5;

// Bütçe sayacı Redis'te tam sayı tutar: 1 USD = 1.000.000 mikro-USD.
export const MICRO_USD = 1_000_000;

export const ASSISTANT_STYLES = [
  'party',
  'strategy',
  'family',
  'thematic',
  'abstract',
  'cooperative',
  'deduction',
  'word',
  'card',
] as const;
export type AssistantStyle = (typeof ASSISTANT_STYLES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// AvgWeight (1-5) aralıkları. Aralıklar bilerek örtüşür: 1.9 hem kolay hem orta sayılır.
export const DIFFICULTY_WEIGHT_RANGES: Record<Difficulty, [number, number]> = {
  easy: [0, 2.0],
  medium: [1.8, 3.0],
  hard: [2.8, 5],
};

// BGG numaraları -> stil. Kodlar davinci-prod'daki gerçek oyunlarla doğrulandı
// (Codenames 5498/1030/1025, Secret Hitler 1039/2814, Splendor 5499).
export const STYLE_RULES: Record<
  AssistantStyle,
  { subdomains?: number[]; categories?: number[]; mechanics?: number[] }
> = {
  party: { subdomains: [5498], categories: [1030] },
  family: { subdomains: [5499] },
  strategy: { subdomains: [5497] },
  thematic: { subdomains: [5496] },
  abstract: { subdomains: [4666], categories: [1009] },
  cooperative: { mechanics: [2023] },
  deduction: { categories: [1039], mechanics: [2814] },
  word: { categories: [1025] },
  card: { categories: [1002] },
};

export const ASSISTANT_TEXTS = {
  offTopic:
    'Ben oyun önerisi konusunda yardımcı olabiliyorum 🙂 Kaç kişisiniz, ne tür oyun seversiniz?',
  rateLimited: 'Çok hızlı yazdınız, birazdan tekrar deneyebilir misiniz?',
  tooLong: 'Mesajınız biraz uzun oldu, kısaca yazabilir misiniz?',
  fallback:
    'Şu an size yardımcı olamıyorum. "Ne Oynasak" sihirbazıyla oyun seçebilirsiniz.',
};
