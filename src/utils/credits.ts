// Kaufmännische Rundung (round half up) — app-weit verbindlich.
// Math.round rundet 0.5 immer auf (für positive Werte), exakt was wir wollen.
export const roundCredits = (amount: number): number => Math.round(amount);

export const MIN_WIN_BONUS = 2;

// Parimutuel-Auszahlung für einen einzelnen Gewinner-Tipp.
// effectivePool = Summe aller Einsätze (+ optionaler Seed der Hausbank).
// Garantierter Mindestgewinn: Einsatz + 2 Credits.
export const calcWinnerPayout = (
  stake: number,
  totalWinnerStake: number,
  effectivePool: number,
): number => {
  if (totalWinnerStake <= 0) return roundCredits(stake + MIN_WIN_BONUS);
  const raw = (stake / totalWinnerStake) * effectivePool;
  return Math.max(roundCredits(raw), stake + MIN_WIN_BONUS);
};

// Live-Vorschau während der Slider bewegt wird: zeigt den aktuellen
// möglichen Gewinn wenn der Spieler jetzt diesen Betrag setzt.
// pool = aktueller Topf der gewählten Option, total = Gesamttopf, seed = Hausbank-Anteil.
export const calcLivePayout = (
  stake: number,
  optionPool: number,
  totalPool: number,
  seed = 0,
): number => {
  const simOptionStake = optionPool + stake;
  const simEffectivePool = totalPool + stake + seed;
  if (simOptionStake <= 0) return 0;
  const raw = (stake / simOptionStake) * simEffectivePool;
  return Math.max(roundCredits(raw), stake + MIN_WIN_BONUS);
};

// Anteil einer Option am Gesamttopf (0..1). Für Warnhinweis + Underdog-Erkennung.
export const poolShare = (optionPool: number, totalPool: number): number =>
  totalPool <= 0 ? 0 : optionPool / totalPool;

// ── Markt-Auszahlungs-Vorschau — EINZIGE Quelle für alle Tabs/Modals ──────────
// Spiegelt die Server-Mathe in netlify/functions/_lib/resolve.ts:
//   Standard → Parimutuel über calcLivePayout (Pool + Seed, Math.round,
//              Mindestgarantie Einsatz + 2). Der globale Jackpot gehört NICHT
//              in den Topf eines Einzelmarkts (er speist nur Finale-Jackpot &
//              Underdog-Bonus) und darf hier nie eingerechnet werden.
//   Combo    → Einsatz × Multiplikator.
// existingBet = bereits platzierte Wette des Spielers, die in den Pools steckt;
// sie wird vor der Simulation herausgerechnet (Anzeige/Ändern ohne Doppelzählung).
export interface PreviewMarket {
  type?: string;
  multiplier?: number;
  options: { id: string; pool: number }[];
  initialSeedCredits?: number;
}
export function calcMarketPayoutPreview(
  market: PreviewMarket,
  optionId: string,
  betAmt: number,
  existingBet?: { optionId: string; amount: number },
): number {
  const opt = market.options.find(o => o.id === optionId);
  if (!opt) return 0;
  if (market.type === 'combo') return betAmt * (market.multiplier ?? 3);
  let optStart = opt.pool;
  let totalStart = market.options.reduce((s, o) => s + o.pool, 0);
  if (existingBet) {
    totalStart -= existingBet.amount;
    if (existingBet.optionId === optionId) optStart -= existingBet.amount;
  }
  return calcLivePayout(betAmt, optStart, totalStart, market.initialSeedCredits ?? 0);
}

export const UNDERDOG_THRESHOLD = 0.15; // < 15% Pool-Anteil = Außenseiter
export const FAVORITE_WARNING_THRESHOLD = 0.75; // > 75% = Warnhinweis
export const UNDERDOG_BONUS = 0.1; // +10% Extra aus Hausbank

// Gesamtvermoegen eines Spielers = verfuegbare Tokens + Einsaetze in noch
// nicht aufgeloesten Maerkten (status open/locked). Wichtig fuer Schwellen-
// Checks (Buyback-Berechtigung, Ueberlebensmodus): ein Spieler, dessen
// Tokens nur in offenen Wetten gebunden sind, ist nicht "bankrott" — er
// muss nur warten, bis sich die Wetten aufloesen.
export function getTotalWealth(
  playerId: string,
  tokens: number,
  bets: { playerId: string; marketId: string; amount: number }[],
  markets: { id: string; status: string }[],
): number {
  const openMarketIds = new Set(
    markets.filter(m => m.status === 'open' || m.status === 'locked').map(m => m.id),
  );
  const lockedStake = bets
    .filter(b => b.playerId === playerId && openMarketIds.has(b.marketId))
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return tokens + lockedStake;
}
