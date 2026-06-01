import type { Context } from '@netlify/functions';
import { getDb, getAdminAuth } from './_lib/firebaseAdmin';
import { verifyAdmin, adminEmails } from './_lib/adminAuth';

// Admin-only. Entfernt einen Spieler vollständig: players-Dokument, dessen
// Wetten & Antworten, die Namens-Reservierung (usernames) und — falls vorhanden
// — den Firebase-Auth-Account. Admins können nicht entfernt werden.
//
// Aufruf vom Admin-Panel via POST:
//   Authorization: Bearer <Firebase ID Token>
//   Body: { playerId }
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const playerId = body?.playerId ? String(body.playerId) : '';
  if (!playerId) return json({ error: 'playerId erforderlich.' }, 400);

  const db = getDb();
  try {
    const ref = db.collection('players').doc(playerId);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: 'Spieler nicht gefunden.' }, 404);
    const data = snap.data() as any;

    const email = (data.email as string | undefined)?.toLowerCase();
    if (email && adminEmails().includes(email)) {
      return json({ error: 'Admins können nicht entfernt werden.' }, 403);
    }

    let batch = db.batch();
    let n = 0;
    const flush = async () => { if (n > 0) { await batch.commit(); batch = db.batch(); n = 0; } };

    // Wetten + Antworten des Spielers löschen
    for (const col of ['bets', 'answers']) {
      const qs = await db.collection(col).where('playerId', '==', playerId).get();
      for (const d of qs.docs) { batch.delete(d.ref); if (++n >= 400) await flush(); }
    }

    // Namens-Reservierung freigeben (Slug muss zu Register.nameSlug passen)
    if (data.name) {
      const slug = String(data.name).trim().toLowerCase().replace(/[/.#$[\]]/g, '_');
      if (slug) { batch.delete(db.collection('usernames').doc(slug)); n++; }
    }

    batch.delete(ref);
    n++;
    await flush();

    // Auth-Account löschen (UID == playerId bei echten Spielern; Test-Spieler haben keinen)
    try { await getAdminAuth().deleteUser(playerId); } catch { /* kein Auth-User → ignorieren */ }

    return json({ ok: true, removed: data.name ?? playerId });
  } catch (err: any) {
    return json({ error: err.message ?? 'Entfernen fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
