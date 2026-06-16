import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Admin: korrigiert negative Token-Guthaben (entstanden durch früheren Doppel-
// Auto-Abzug bei gleichzeitig sperrenden Spielen). Setzt jedes negative Guthaben
// auf 0 und nimmt den fälschlich in den Jackpot geflossenen Überschuss wieder
// heraus (jackpot -= Summe der zurückgegebenen Token), damit die Token-Bilanz
// stimmt. tokens ist ein Schutzfeld → nur serverseitig (Admin-SDK) schreibbar.

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  const db = getDb();
  try {
    const snap = await db.collection('players').get();
    const batch = db.batch();
    let fixed = 0;
    let restored = 0;
    for (const d of snap.docs) {
      const t = Number((d.data() as any).tokens ?? 0);
      if (t < 0) {
        batch.update(d.ref, { tokens: 0 });
        restored += -t;
        fixed++;
      }
    }
    if (restored > 0) {
      batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(-restored) });
    }
    if (fixed > 0) await batch.commit();
    return json({ ok: true, fixed, restored });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Korrektur fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
