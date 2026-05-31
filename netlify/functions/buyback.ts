import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAuth } from './_lib/userAuth';
import { verifyAdmin } from './_lib/adminAuth';

// Buyback-Aktion: einmaliger Wiedereinstieg mit +800 TKN. Atomar gegen
// Doppel-Klick (buybackUsed-Flag wird transaktional gesetzt).
//
// Body { playerId? } — fehlt = eigener Spieler (auth.uid). Admin darf
// playerId angeben (z. B. um einem Spieler manuell Buyback zu gewähren oder
// für Test-Spieler).

interface BuybackBody { playerId?: string; }

const BUYBACK_TOKENS = 800;

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAuth(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: BuybackBody = {};
  try { body = (await req.json()) as BuybackBody; } catch { /* leerer Body OK */ }

  const targetPlayerId = body.playerId || auth.uid!;
  const isSelf = targetPlayerId === auth.uid;

  // Admin-Sondererlaubnis: fremder Player-Trigger geht nur als Admin
  if (!isSelf) {
    const adm = await verifyAdmin(req);
    if (!adm.ok) return json({ error: 'Nur Admins dürfen Buyback für andere auslösen.' }, 403);
  }

  const db = getDb();
  const playerRef = db.collection('players').doc(targetPlayerId);

  try {
    const result = await db.runTransaction(async tx => {
      const pSnap = await tx.get(playerRef);
      if (!pSnap.exists) throw new Error('player_not_found');
      const p = pSnap.data() as any;
      if (p.buybackUsed) throw new Error('already_used');
      const newTokens = Number(p.tokens ?? 0) + BUYBACK_TOKENS;
      tx.update(playerRef, { tokens: newTokens, buybackUsed: true });
      return { newTokens };
    });
    return json({ ok: true, newTokens: result.newTokens });
  } catch (err: any) {
    const code = String(err?.message ?? 'unknown');
    return json({ error: errorMessage(code), code }, mapStatus(code));
  }
};

function errorMessage(code: string): string {
  switch (code) {
    case 'player_not_found': return 'Spieler-Profil fehlt.';
    case 'already_used':     return 'Buyback wurde bereits genutzt.';
    default:                  return 'Buyback fehlgeschlagen.';
  }
}
function mapStatus(code: string): number {
  if (code === 'player_not_found') return 404;
  return 409;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
