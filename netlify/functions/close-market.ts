import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Markt schliessen / refunden. Storniert offene oder gesperrte Märkte und
// erstattet allen Spielern ihren Einsatz zurück.
//   1. Markt-Status prüfen (open|locked)
//   2. Alle bets dieses Markts laden, Refund pro Spieler aggregieren
//   3. tokens += refund pro Spieler, bets löschen, Markt -> cancelled (pool=0)
// Atomar genug via batch; Bets-Reads stehen vor dem Batch.
//
// Auth: nur Admin (verifyAdmin).

interface Body { marketId: string; }

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }
  if (!body.marketId) return json({ error: 'marketId erforderlich.' }, 400);

  const db = getDb();
  const marketRef = db.collection('markets').doc(body.marketId);

  try {
    const marketSnap = await marketRef.get();
    if (!marketSnap.exists) return json({ error: 'Markt nicht gefunden.', code: 'market_not_found' }, 404);
    const market = marketSnap.data() as any;
    if (market.status !== 'open' && market.status !== 'locked') {
      return json({ error: 'Markt ist nicht im offenen Zustand.', code: 'market_not_open_or_locked' }, 409);
    }

    const betsSnap = await db.collection('bets').where('marketId', '==', body.marketId).get();
    const refunds: Record<string, number> = {};
    betsSnap.forEach(d => {
      const b = d.data() as any;
      const amt = Number(b.amount ?? 0);
      if (amt > 0) refunds[b.playerId] = (refunds[b.playerId] ?? 0) + amt;
    });

    const clearedOptions = (Array.isArray(market.options) ? market.options : []).map((o: any) => ({ ...o, pool: 0 }));

    const batch = db.batch();
    batch.update(marketRef, { status: 'cancelled', options: clearedOptions });
    for (const d of betsSnap.docs) batch.delete(d.ref);
    for (const [pid, amt] of Object.entries(refunds)) {
      batch.update(db.collection('players').doc(pid), {
        tokens: FieldValue.increment(amt),
      });
    }
    await batch.commit();

    return json({ ok: true, refunded: Object.values(refunds).reduce((s, v) => s + v, 0), refundedPlayers: Object.keys(refunds).length });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Schliessen fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
