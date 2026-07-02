import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Admin-only: einen bestehenden Einsatz/Tipp im Nachhinein korrigieren
// (Option und/oder Betrag). Anders als change-bet OHNE Zeit-/Annahmeschluss-
// Sperren — funktioniert für OFFENE und GESPERRTE (noch nicht aufgelöste) Märkte.
//
// Rechnet die alte Pool-/Token-Buchung sauber zurück und die neue rein:
//   • Option-Pools (options[].pool) und ggf. lockedPoolSnapshot anpassen
//   • Spieler-Tokens: alter Einsatz zurück, neuer abgezogen
//   • Bet-Doc überschreiben + Audit-Eintrag (betChanges, adminCorrection: true)
//
// Aufgelöste/stornierte Märkte werden abgelehnt (dort zählt die Auszahlung schon;
// dafür ist die Auflösungs-Korrektur zuständig).

interface Body {
  marketId: string;
  playerId: string;
  newOptionId: string;
  newOptionLabel?: string;
  newAmount: number;
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }

  const { marketId, playerId, newOptionId } = body;
  const newAmount = Math.max(0, Math.floor(Number(body.newAmount ?? 0)));
  if (!marketId || !playerId || !newOptionId) return json({ error: 'marketId, playerId und newOptionId erforderlich.' }, 400);

  const db = getDb();
  const betId = `${marketId}__${playerId}`;
  const betRef = db.collection('bets').doc(betId);
  const playerRef = db.collection('players').doc(playerId);
  const marketRef = db.collection('markets').doc(marketId);
  const changeRef = db.collection('betChanges').doc();
  const now = Date.now();

  let result: { oldAmount: number; newAmount: number; tokenDelta: number; playerName: string } | null = null;

  try {
    await db.runTransaction(async tx => {
      const [betSnap, playerSnap, marketSnap] = await Promise.all([
        tx.get(betRef), tx.get(playerRef), tx.get(marketRef),
      ]);
      if (!betSnap.exists) throw new Error('bet_not_found');
      if (!playerSnap.exists) throw new Error('player_not_found');
      if (!marketSnap.exists) throw new Error('market_not_found');

      const old = betSnap.data() as any;
      const p = playerSnap.data() as any;
      const m = marketSnap.data() as any;

      // Nur nicht-aufgelöste Märkte — bei resolved/cancelled zählt die Auszahlung
      // bereits (dafür ist die Auflösungs-Korrektur da).
      if (m.status !== 'open' && m.status !== 'locked') throw new Error('market_resolved');

      const options = Array.isArray(m.options) ? (m.options as any[]) : [];
      const newOpt = options.find(o => o.id === newOptionId);
      if (!newOpt) throw new Error('option_not_found');

      const oldAmount = Number(old.amount ?? 0);
      const oldOptionId = String(old.optionId ?? '');
      const newLabel = body.newOptionLabel ?? String(newOpt.label ?? newOptionId);
      const tokens = Number(p.tokens ?? 0);

      // Token-Saldo: alter Einsatz zurück, neuer abgezogen.
      const tokenDelta = oldAmount - newAmount;
      const newTokens = tokens + tokenDelta;
      if (newTokens < 0) throw new Error('insufficient_tokens');

      // Pools anpassen (alte Option entlasten, neue belasten).
      if (oldAmount !== 0 || newAmount !== 0) {
        const newOptions = options.map(o => {
          let pool = Number(o.pool ?? 0);
          if (o.id === oldOptionId) pool -= oldAmount;
          if (o.id === newOptionId) pool += newAmount;
          return { ...o, pool };
        });
        const marketUpd: Record<string, any> = { options: newOptions };
        // Bei gesperrten Märkten den Snapshot mitziehen, damit die Auswertung
        // (Underdog/Verteilung) mit den korrigierten Pools rechnet.
        if (m.lockedPoolSnapshot && typeof m.lockedPoolSnapshot === 'object') {
          const snap: Record<string, number> = { ...m.lockedPoolSnapshot };
          if (oldOptionId) snap[oldOptionId] = Number(snap[oldOptionId] ?? 0) - oldAmount;
          snap[newOptionId] = Number(snap[newOptionId] ?? 0) + newAmount;
          marketUpd.lockedPoolSnapshot = snap;
        }
        tx.update(marketRef, marketUpd);
      }
      if (tokenDelta !== 0) tx.update(playerRef, { tokens: newTokens });

      tx.set(betRef, {
        id: betId,
        marketId,
        playerId,
        optionId: newOptionId,
        optionLabel: newLabel,
        amount: newAmount,
        timestamp: now,
        active: true, // offener/gesperrter Markt → bleibt aktiv (Live-Listener)
      });

      tx.set(changeRef, {
        playerId,
        marketId,
        ts: now,
        oldOptionId,
        oldOptionLabel: String(old.optionLabel ?? ''),
        oldAmount,
        newOptionId,
        newOptionLabel: newLabel,
        newAmount,
        tokenDelta,
        adminCorrection: true,
      });

      result = { oldAmount, newAmount, tokenDelta, playerName: String(p.name ?? p.displayName ?? playerId) };
    });

    return json({ ok: true, ...(result ?? {}) });
  } catch (err: any) {
    const code = String(err?.message ?? 'unknown');
    return json({ error: errorMessage(code), code }, mapStatus(code));
  }
};

function errorMessage(code: string): string {
  switch (code) {
    case 'bet_not_found':       return 'Für diesen Spieler gibt es hier keinen Tipp.';
    case 'player_not_found':    return 'Spieler-Profil fehlt.';
    case 'market_not_found':    return 'Markt nicht gefunden.';
    case 'market_resolved':     return 'Markt ist schon aufgelöst/storniert — bitte die Auflösungs-Korrektur nutzen.';
    case 'option_not_found':    return 'Diese Option gibt es nicht.';
    case 'insufficient_tokens': return 'Nicht genug Tokens für den neuen Einsatz.';
    default:                    return 'Korrektur fehlgeschlagen.';
  }
}
function mapStatus(code: string): number {
  if (code === 'player_not_found' || code === 'market_not_found' || code === 'bet_not_found' || code === 'option_not_found') return 404;
  return 409;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
