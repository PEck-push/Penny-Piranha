import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';
import { resolveMarketAdmin } from './_lib/resolve';

// HTTP POST — admin-only, testMode only.
// Body: { marketId: string, scoreA: number, scoreB: number }
// Resolves a locked wm-match market with a simulated score, identical to the
// result auto-resolve.ts would produce when football-data.org returns FINISHED.
export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  const db = getDb();

  const appSnap = await db.collection('appState').doc('global').get();
  if (!(appSnap.data()?.testMode ?? true)) {
    return json({ error: 'sim-result ist nur im Testmodus verfügbar.' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { marketId, scoreA, scoreB } = body ?? {};
  if (!marketId || scoreA === undefined || scoreB === undefined) {
    return json({ error: 'marketId, scoreA und scoreB sind erforderlich.' }, 400);
  }

  const a = Number(scoreA);
  const b = Number(scoreB);
  if (isNaN(a) || isNaN(b)) return json({ error: 'scoreA und scoreB müssen Zahlen sein.' }, 400);

  const winningOptionId = a > b ? 'home' : b > a ? 'away' : 'draw';

  try {
    const result = await resolveMarketAdmin(marketId, winningOptionId, 'auto');
    return json({ ok: true, winningOptionId, scoreA: a, scoreB: b, ...result });
  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
