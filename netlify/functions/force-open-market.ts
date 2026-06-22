import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// HTTP POST — admin-only, testMode only.
// Body: { matchId: string }
// Creates a wm-match market immediately, bypassing the 48h window from tick.ts.
// Uses identical market structure so the result is indistinguishable from tick.ts.

// Muss mit src/utils/phase.ts (PHASE_LIMITS) identisch bleiben.
const PHASE_LIMITS: Record<string, { minBet: number; maxBet: number; autoDeduct: number }> = {
  gruppenphase:      { minBet: 10,  maxBet: 100, autoDeduct: 10 },
  sechzehntelfinale: { minBet: 45,  maxBet: 290, autoDeduct: 45 },
  achtelfinale:      { minBet: 60,  maxBet: 360, autoDeduct: 60 },
  viertelfinale:     { minBet: 75,  maxBet: 430, autoDeduct: 75 },
  halbfinale:        { minBet: 90,  maxBet: 490, autoDeduct: 90 },
  platz3:            { minBet: 75,  maxBet: 430, autoDeduct: 75 },
  finale:            { minBet: 105, maxBet: 550, autoDeduct: 105 },
};

export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  const db = getDb();

  const appSnap = await db.collection('appState').doc('global').get();
  if (!(appSnap.data()?.testMode ?? true)) {
    return json({ error: 'force-open-market ist nur im Testmodus verfügbar.' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const matchId = body?.matchId as string | undefined;
  if (!matchId) return json({ error: 'matchId erforderlich.' }, 400);

  const existingSnap = await db.collection('markets')
    .where('matchId', '==', matchId)
    .where('marketSubtype', '==', 'wm-match')
    .get();
  if (!existingSnap.empty) {
    return json({ error: 'Markt existiert bereits.', marketId: existingSnap.docs[0].id });
  }

  const matchSnap = await db.collection('schedule').doc(matchId).get();
  if (!matchSnap.exists) return json({ error: 'Match nicht im Spielplan gefunden.' }, 404);

  const match = matchSnap.data() as any;
  const limits = PHASE_LIMITS[match.phase as string] ?? PHASE_LIMITS.gruppenphase;
  const question = `${match.teamA} vs. ${match.teamB}`;

  const marketRef = db.collection('markets').doc();
  await marketRef.set({
    question,
    type: 'standard',
    status: 'open',
    createdBy: 'admin-force',
    createdAt: Date.now(),
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

  await db.collection('feed').doc().set({
    type: 'market_locked',
    marketId: marketRef.id,
    text: `⚽ Markt offen (test): ${question}`,
    ts: FieldValue.serverTimestamp(),
  });

  return json({ ok: true, marketId: marketRef.id, question });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
