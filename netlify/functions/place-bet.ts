import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAuth } from './_lib/userAuth';

// Atomare Wette/Tipp-Platzierung. Macht den ganzen kritischen Pfad in einer
// Transaction:
//   1. Status/Kickoff/Expires des Markts prüfen
//   2. Bet-Doppel-Check (deterministische Bet-ID = `${marketId}__${playerId}`)
//   3. Token-Stand prüfen, Tokens dekrementieren (nur bei amount > 0)
//   4. Pool der Option inkrementieren (nur bei amount > 0)
//   5. Bet-Doc schreiben
//
// Sicherheitsmodell:
//   - Eigene Wette: jeder authed User für die eigene uid.
//   - Admin darf für TEST-Spieler wetten (isTestPlayer == true) — wird vom
//     Admin-Panel für das manuelle Befüllen von Pools benutzt.
//   - Nicht-Admin darf NIE für jemand anders schreiben.

interface PlaceBetBody {
  marketId: string;
  optionId: string;
  optionLabel: string;
  amount: number;          // 0 = Gratis-Tipp (Jackpot-Sonderrunde)
  playerId?: string;       // optional; default = auth.uid (Admin: Test-Spieler erlaubt)
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAuth(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: PlaceBetBody;
  try { body = (await req.json()) as PlaceBetBody; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }

  const { marketId, optionId, optionLabel } = body;
  const amount = Math.max(0, Math.floor(Number(body.amount ?? 0)));
  const targetPlayerId = body.playerId || auth.uid!;

  if (!marketId || !optionId) return json({ error: 'marketId und optionId erforderlich.' }, 400);
  if (typeof optionLabel !== 'string') return json({ error: 'optionLabel erforderlich.' }, 400);

  const db = getDb();
  const betId = `${marketId}__${targetPlayerId}`;
  const betRef = db.collection('bets').doc(betId);
  const playerRef = db.collection('players').doc(targetPlayerId);
  const marketRef = db.collection('markets').doc(marketId);
  const now = Date.now();

  try {
    await db.runTransaction(async tx => {
      const [betSnap, playerSnap, marketSnap] = await Promise.all([
        tx.get(betRef),
        tx.get(playerRef),
        tx.get(marketRef),
      ]);

      if (!playerSnap.exists) throw new Error('player_not_found');
      if (!marketSnap.exists) throw new Error('market_not_found');
      const p = playerSnap.data() as any;
      const m = marketSnap.data() as any;

      // Wer-darf-für-wen-Check
      if (targetPlayerId !== auth.uid) {
        if (!auth.isAdmin) throw new Error('forbidden_not_admin');
        if (!p.isTestPlayer) throw new Error('forbidden_target_not_test');
      }

      if (betSnap.exists) throw new Error('already_bet');
      if (m.status !== 'open') throw new Error('market_not_open');
      if (typeof m.kickoffAt === 'number' && now >= m.kickoffAt) throw new Error('market_kickoff_passed');
      if (typeof m.expiresAt === 'number' && now > m.expiresAt) throw new Error('market_expired');

      const options = Array.isArray(m.options) ? (m.options as any[]) : [];
      const opt = options.find(o => o.id === optionId);
      if (!opt) throw new Error('option_not_found');

      const tokens = Number(p.tokens ?? 0);
      if (amount > 0 && tokens < amount) throw new Error('insufficient_tokens');

      if (amount > 0) {
        // Pool atomar im Markt-Doc fortschreiben (verhindert Lost-Update bei
        // parallelen Wetten).
        const newOptions = options.map(o =>
          o.id === optionId ? { ...o, pool: Number(o.pool ?? 0) + amount } : o
        );
        tx.update(marketRef, { options: newOptions });
        tx.update(playerRef, { tokens: tokens - amount });
      }

      tx.set(betRef, {
        id: betId,
        marketId,
        playerId: targetPlayerId,
        optionId,
        optionLabel,
        amount,
        timestamp: now,
      });
    });

    return json({ ok: true, betId });
  } catch (err: any) {
    const code = String(err?.message ?? 'unknown');
    return json({ error: errorMessage(code), code }, mapStatus(code));
  }
};

function errorMessage(code: string): string {
  switch (code) {
    case 'already_bet':              return 'Du hast hier schon getippt.';
    case 'player_not_found':         return 'Spieler-Profil fehlt.';
    case 'market_not_found':         return 'Markt nicht gefunden.';
    case 'market_not_open':          return 'Markt ist nicht mehr offen.';
    case 'market_kickoff_passed':    return 'Anpfiff ist schon — keine Tipps mehr.';
    case 'market_expired':           return 'Tipp-Fenster geschlossen.';
    case 'option_not_found':         return 'Diese Option gibt es nicht.';
    case 'insufficient_tokens':      return 'Nicht genug Tokens.';
    case 'forbidden_not_admin':      return 'Nur Admins dürfen für andere wetten.';
    case 'forbidden_target_not_test':return 'Nur für Test-Spieler erlaubt.';
    default:                          return 'Tippen fehlgeschlagen.';
  }
}
function mapStatus(code: string): number {
  if (code.startsWith('forbidden_')) return 403;
  if (code === 'player_not_found' || code === 'market_not_found' || code === 'option_not_found') return 404;
  return 409; // Conflict für Race-/State-Probleme; Client behandelt als Soft-Fail.
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
