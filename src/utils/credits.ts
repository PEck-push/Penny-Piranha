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

export const UNDERDOG_THRESHOLD = 0.15; // < 15% Pool-Anteil = Außenseiter
export const FAVORITE_WARNING_THRESHOLD = 0.75; // > 75% = Warnhinweis
export const UNDERDOG_BONUS = 0.1; // +10% Extra aus Hausbank
