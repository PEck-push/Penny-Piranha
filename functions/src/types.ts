// Shared type definitions mirroring the frontend store types.
// Cloud Functions use these directly against Firestore documents.

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
  maxBet: number; // 0 = all-in
  autoDeduct: number;
}

export const PHASE_LIMITS: Record<Phase, PhaseLimits> = {
  gruppenphase:      { minBet: 10,  maxBet: 150,  autoDeduct: 10  },
  sechzehntelfinale: { minBet: 25,  maxBet: 250,  autoDeduct: 25  },
  achtelfinale:      { minBet: 50,  maxBet: 400,  autoDeduct: 50  },
  viertelfinale:     { minBet: 75,  maxBet: 600,  autoDeduct: 75  },
  halbfinale:        { minBet: 100, maxBet: 800,  autoDeduct: 100 },
  platz3:            { minBet: 50,  maxBet: 400,  autoDeduct: 50  },
  finale:            { minBet: 150, maxBet: 0,    autoDeduct: 150 },
};

export const UNDERDOG_THRESHOLD = 0.15;
export const UNDERDOG_BONUS     = 0.1;
export const MIN_WIN_BONUS      = 2;

export const roundCredits = (n: number): number => Math.round(n);
