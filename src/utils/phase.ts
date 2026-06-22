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

// Sanft staffelnde K.-o.-Limits: Das Maximum steigt nach oben hin FLACHER
// (+80/+70/+70/+60/+60) und ist im Finale bei 550 gedeckelt — bewusst KEIN
// All-in. So bleibt die Gruppenphase (die meisten Spiele) die tragende Säule
// der Wertung; die K.-o.-Runden bringen einen Funken Mehr-Spannung, ohne dass
// ein einzelner Zock einen erkämpften Vorsprung umwirft.
export const PHASE_LIMITS: Record<Phase, PhaseLimits> = {
  gruppenphase:      { minBet: 10,  maxBet: 100, autoDeduct: 10 },
  sechzehntelfinale: { minBet: 45,  maxBet: 290, autoDeduct: 45 },
  achtelfinale:      { minBet: 60,  maxBet: 360, autoDeduct: 60 },
  viertelfinale:     { minBet: 75,  maxBet: 430, autoDeduct: 75 },
  halbfinale:        { minBet: 90,  maxBet: 490, autoDeduct: 90 },
  platz3:            { minBet: 75,  maxBet: 430, autoDeduct: 75 },
  finale:            { minBet: 105, maxBet: 550, autoDeduct: 105 },
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

// Einsatzlimits einer Phase. In der Gruppenphase steigen die Limits ab dem
// 2. Spieltag (mehr Impact pro Spiel): min 30 / max 210 / Auto-Abzug 30.
// Spieltag 1 bleibt bei min 10 / max 100 / Auto-Abzug 10.
export const getLimits = (phase: Phase, matchday?: number): PhaseLimits => {
  if (phase === 'gruppenphase' && (matchday ?? 1) >= 2) {
    return { minBet: 30, maxBet: 210, autoDeduct: 30 };
  }
  return PHASE_LIMITS[phase];
};

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

// Effektiver Maximaleinsatz: durch Guthaben begrenzt (maxBet 0 = All-in, aktuell ungenutzt).
export const effectiveMaxBet = (tokens: number, phase: Phase): number => {
  const { maxBet } = PHASE_LIMITS[phase];
  if (maxBet === 0) return tokens; // 0 = kein Limit (All-in), falls eine Phase es nutzt
  return Math.min(maxBet, tokens);
};

// Buyback nur bis Ende Sechzehntelfinale verfügbar.
export const BUYBACK_PHASES: Phase[] = ['gruppenphase', 'sechzehntelfinale'];
export const isBuybackAvailable = (phase: Phase): boolean => BUYBACK_PHASES.includes(phase);

export const BUYBACK_BASE = 800;
