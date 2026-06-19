import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Admin: setzt das `active`-Flag an allen Tipp-Dokumenten anhand des Markt-Status.
// active = true  → Markt ist 'open' oder 'locked' (Wette läuft / noch nicht ausgewertet)
// active = false → Markt ist 'resolved'/'cancelled' (oder verwaist/nicht gefunden)
//
// Unsichtbares Fundament (Schritt 1) für die spätere Eingrenzung des bets-Listeners:
// Der Client soll künftig nur noch eigene + aktive Tipps live laden statt ALLER Tipps.
// Schreibt nur dort, wo sich der Wert ändert (minimiert Writes). `bets` ist nur
// serverseitig (Admin-SDK) schreibbar → daher als Function.

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  const db = getDb();
  try {
    const [marketsSnap, betsSnap] = await Promise.all([
      db.collection('markets').get(),
      db.collection('bets').get(),
    ]);
    const status = new Map<string, string>();
    marketsSnap.forEach(d => status.set(d.id, String((d.data() as any).status ?? '')));

    let batch = db.batch();
    let pending = 0;
    let updated = 0;
    let active = 0;
    let inactive = 0;
    for (const d of betsSnap.docs) {
      const b = d.data() as any;
      const st = status.get(String(b.marketId));
      const desired = st === 'open' || st === 'locked';
      if (desired) active++; else inactive++;
      if (b.active === desired) continue;
      batch.update(d.ref, { active: desired });
      pending++;
      updated++;
      if (pending >= 450) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
    return json({ ok: true, total: betsSnap.size, updated, active, inactive });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Backfill fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
