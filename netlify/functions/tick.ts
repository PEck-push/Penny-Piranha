import type { Config } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';

// Runs every minute. Two jobs:
//   1. OPEN: create a betting market for any scheduled match whose kickoff is
//      within the next 48h and that has no market yet.
//   2. LOCK: lock any open market whose kickoff has passed, snapshot the pool,
//      and apply auto-deductions to players who didn't bet.

const OPEN_WINDOW_MS = 48 * 60 * 60 * 1000;

const PHASE_LIMITS: Record<string, { minBet: number; maxBet: number; autoDeduct: number }> = {
  gruppenphase:      { minBet: 10,  maxBet: 150, autoDeduct: 10 },
  sechzehntelfinale: { minBet: 25,  maxBet: 250, autoDeduct: 25 },
  achtelfinale:      { minBet: 50,  maxBet: 400, autoDeduct: 50 },
  viertelfinale:     { minBet: 75,  maxBet: 600, autoDeduct: 75 },
  halbfinale:        { minBet: 100, maxBet: 800, autoDeduct: 100 },
  platz3:            { minBet: 50,  maxBet: 400, autoDeduct: 50 },
  finale:            { minBet: 150, maxBet: 0,   autoDeduct: 150 },
};

export default async () => {
  const db = getDb();
  const now = Date.now();

  // ── 1. OPEN markets 48h before kickoff ────────────────────────────────────
  // Read-Optimierung: nur Spiele im 48h-Fenster lesen statt des ganzen Spielplans.
  // Range-Query auf einem einzelnen Feld → kein Composite-Index nötig. Steht kein
  // Spiel an (z.B. vor dem Turnier), wird auch der markets-Read übersprungen.
  const scheduleSnap = await db
    .collection('schedule')
    .where('kickoffAt', '>', now)
    .where('kickoffAt', '<=', now + OPEN_WINDOW_MS)
    .get();

  if (!scheduleSnap.empty) {
    // Duplikat-Check nur für die Spiele im Fenster (matchId 'in'), statt ALLE
    // wm-match-Märkte zu lesen. 'in' erlaubt max. 30 Werte — im 48h-Fenster
    // liegen nie mehr als ein gutes Dutzend Spiele, daher unkritisch.
    const windowMatchIds = scheduleSnap.docs.map(d => d.id).slice(0, 30);
    const existingMarkets = await db.collection('markets').where('matchId', 'in', windowMatchIds).get();
    const marketByMatch = new Map<string, any>();
    existingMarkets.forEach(d => {
      const data = d.data();
      if (data.matchId) marketByMatch.set(data.matchId, { id: d.id, ...data });
    });

    for (const doc of scheduleSnap.docs) {
      const match = doc.data() as any;
      const matchId = doc.id;
      if (marketByMatch.has(matchId)) continue;
      if (typeof match.kickoffAt !== 'number') continue;

      const limits = PHASE_LIMITS[match.phase as string] ?? PHASE_LIMITS.gruppenphase;
      const marketRef = db.collection('markets').doc();
      await marketRef.set({
        question: `${match.teamA} vs. ${match.teamB}`,
        type: 'standard',
        status: 'open',
        createdBy: 'system',
        createdAt: now,
        options: [
          { id: 'home', label: match.teamA, pool: 0 },
          { id: 'draw', label: 'Unentschieden', pool: 0 },
          { id: 'away', label: match.teamB, pool: 0 },
        ],
        winningOptionId: null,
        resolutionType: null,
        isOpenQuestion: false,
        marketSubtype: 'wm-match',
        matchId,
        footballDataOrgId: match.footballDataOrgId ?? null,
        teamA: match.teamA,
        teamB: match.teamB,
        kickoffAt: match.kickoffAt,
        groupLabel: match.groupLabel ?? '',
        phase: match.phase ?? 'gruppenphase',
        minBet: limits.minBet,
        maxBet: limits.maxBet,
        autoDeductAmount: limits.autoDeduct,
        autoDeductProcessed: false,
      });
      marketByMatch.set(matchId, { id: marketRef.id });
      const feedRef = db.collection('feed').doc();
      await feedRef.set({
        type: 'market_locked',
        marketId: marketRef.id,
        text: `⚽ Markt offen: ${match.teamA} vs. ${match.teamB}`,
        ts: FieldValue.serverTimestamp(),
      });
    }
  }

  // ── 2. LOCK markets at kickoff + auto-deductions ───────────────────────────
  const openSnap = await db
    .collection('markets')
    .where('status', '==', 'open')
    .where('marketSubtype', '==', 'wm-match')
    .get();

  // Nur Märkte, deren Anpfiff erreicht ist und die noch nicht verarbeitet wurden.
  const toLock = openSnap.docs.filter(d => {
    const m = d.data() as any;
    return typeof m.kickoffAt === 'number' && m.kickoffAt <= now && !m.autoDeductProcessed;
  });

  // players nur lesen, wenn wirklich gesperrt wird (spart Reads bei Leerlauf-Ticks).
  if (toLock.length === 0) return new Response('ok');

  const playersSnap = await db.collection('players').get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  for (const marketDoc of toLock) {
    const market = marketDoc.data() as any;

    const lockedPoolSnapshot: Record<string, number> = {};
    (market.options ?? []).forEach((o: any) => { lockedPoolSnapshot[o.id] = o.pool ?? 0; });

    const betsSnap = await db.collection('bets').where('marketId', '==', marketDoc.id).get();
    const bettorIds = new Set(betsSnap.docs.map(d => (d.data() as any).playerId as string));

    const autoDeduct: number = market.autoDeductAmount ?? 10;
    let jackpotGain = 0;
    const batch = db.batch();

    for (const player of players) {
      if (bettorIds.has(player.id)) continue;
      const tokens = player.tokens ?? 0;
      if (tokens <= 0) continue;
      const amount = Math.min(tokens, autoDeduct);
      if (amount <= 0) continue;

      batch.update(db.collection('players').doc(player.id), { tokens: FieldValue.increment(-amount) });
      jackpotGain += amount;
      const auditRef = db.collection('autoDeductions').doc();
      batch.set(auditRef, {
        playerId: player.id,
        marketId: marketDoc.id,
        amount,
        tokensAfter: tokens - amount,
        ts: FieldValue.serverTimestamp(),
      });
    }

    batch.update(marketDoc.ref, {
      status: 'locked',
      lockedPoolSnapshot,
      autoDeductProcessed: true,
      lockedAt: FieldValue.serverTimestamp(),
    });
    if (jackpotGain > 0) {
      batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(jackpotGain) });
    }
    await batch.commit();
  }

  return new Response('ok');
};

export const config: Config = {
  schedule: '*/15 * * * *',
};
