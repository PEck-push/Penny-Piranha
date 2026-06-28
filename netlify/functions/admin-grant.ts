import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Admin-Grant: manuelle Token-Vergabe und/oder Accessoire-Freischaltung für
// einen Spieler. Schreibt Schutzfelder (tokens, unlockedOverlays), daher
// ausschliesslich Admin-Pfad.
//
// Body: { playerId, tokens?, setTokens?, accessoryId? }
//   tokens     — relativ zu addierender Betrag (kann negativ sein für Abzug).
//   setTokens  — ABSOLUT zu setzender Token-Stand (z. B. 0 beim Ausscheiden).
//                Hat Vorrang vor `tokens`.
//   accessoryId — ID eines Accessoires, das in unlockedOverlays ergänzt wird.
// Mindestens eines muss gesetzt sein.

interface Body { playerId: string; tokens?: number; setTokens?: number; accessoryId?: string; }

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }
  if (!body.playerId) return json({ error: 'playerId erforderlich.' }, 400);
  const tokensDelta = Number.isFinite(body.tokens) ? Math.floor(Number(body.tokens)) : 0;
  const setTokens = Number.isFinite(body.setTokens) ? Math.max(0, Math.floor(Number(body.setTokens))) : null;
  const accessoryId = typeof body.accessoryId === 'string' && body.accessoryId.trim() ? body.accessoryId.trim() : null;
  if (tokensDelta === 0 && setTokens === null && !accessoryId) return json({ error: 'Kein tokens/setTokens oder accessoryId angegeben.' }, 400);

  const db = getDb();
  const playerRef = db.collection('players').doc(body.playerId);

  try {
    const pSnap = await playerRef.get();
    if (!pSnap.exists) return json({ error: 'Spieler-Profil fehlt.', code: 'player_not_found' }, 404);

    const upd: Record<string, any> = {};
    if (setTokens !== null) upd.tokens = setTokens;                       // absolut (Vorrang)
    else if (tokensDelta !== 0) upd.tokens = FieldValue.increment(tokensDelta);
    if (accessoryId) upd.unlockedOverlays = FieldValue.arrayUnion(accessoryId);
    await playerRef.update(upd);

    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Grant fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
