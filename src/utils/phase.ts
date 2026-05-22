export type Phase =
  | 'gruppenphase'
  | 'sechzehntelfinale'
  | 'achtelfinale'
  | 'viertelfinale'
  | 'halbfinale'
  | 'platz3'
  | 'finale';

export interface PhaseLimits {
  minBet: number;
  maxBet: number; // 0 = All-in (kein Limit)
  autoDeduct: number;
}

export const PHASE_LIMITS: Record<Phase, PhaseLimits> = {
  gruppenphase:      { minBet: 10,  maxBet: 150, autoDeduct: 10 },
  sechzehntelfinale: { minBet: 25,  maxBet: 250, autoDeduct: 25 },
  achtelfinale:      { minBet: 50,  maxBet: 400, autoDeduct: 50 },
  viertelfinale:     { minBet: 75,  maxBet: 600, autoDeduct: 75 },
  halbfinale:        { minBet: 100, maxBet: 800, autoDeduct: 100 },
  platz3:            { minBet: 50,  maxBet: 400, autoDeduct: 50 },
  finale:            { minBet: 150, maxBet: 0,   autoDeduct: 150 },
};

export const PHASE_LABELS: Record<Phase, string> = {
  gruppenphase:      'Gruppenphase',
  sechzehntelfinale: 'Sechzehntelfinale',
  achtelfinale:      'Achtelfinale',
  viertelfinale:     'Viertelfinale',
  halbfinale:        'Halbfinale',
  platz3:            'Spiel um Platz 3',
  finale:            'Finale',
};

export const getLimits = (phase: Phase): PhaseLimits => PHASE_LIMITS[phase];

// Überlebensmodus: Spieler kann nicht alle heute offenen Spiele zum normalen
// Mindesteinsatz abdecken. Dann fällt das Minimum auf 1 Credit und er darf
// seine Credits frei verteilen (z.B. alles auf ein Spiel).
export const isSurvivalMode = (
  tokens: number,
  openGamesToday: number,
  phase: Phase,
): boolean => {
  const { minBet } = PHASE_LIMITS[phase];
  return openGamesToday > 0 && tokens < openGamesToday * minBet;
};

// Effektiver Mindesteinsatz: im Überlebensmodus 1 Credit, sonst Phasen-Minimum.
export const effectiveMinBet = (
  tokens: number,
  openGamesToday: number,
  phase: Phase,
): number => (isSurvivalMode(tokens, openGamesToday, phase) ? 1 : PHASE_LIMITS[phase].minBet);

// Effektiver Maximaleinsatz: durch Guthaben begrenzt; Finale = All-in (ganzes Guthaben).
export const effectiveMaxBet = (tokens: number, phase: Phase): number => {
  const { maxBet } = PHASE_LIMITS[phase];
  if (maxBet === 0) return tokens; // Finale: All-in
  return Math.min(maxBet, tokens);
};

// Buyback nur bis Ende Sechzehntelfinale verfügbar.
export const BUYBACK_PHASES: Phase[] = ['gruppenphase', 'sechzehntelfinale'];
export const isBuybackAvailable = (phase: Phase): boolean => BUYBACK_PHASES.includes(phase);

export const BUYBACK_BASE = 800;
