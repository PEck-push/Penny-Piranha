import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAuth } from './_lib/userAuth';

// Atomare Aktualisierung einer bestehenden Wette/Tipp:
//   1. Bestehende Bet finden (Bet-ID = `${marketId}__${playerId}`)
//   2. Markt-Status / Kickoff / Expires prüfen
//   3. Alte Pool-Buchung zurückrechnen, neue verbuchen
//   4. Token-Saldo neu berechnen (alte Wette zurück, neue abziehen)
//   5. Bet-Doc atomar überschreiben
//
// Nur für den eigenen Spieler erlaubt. Admin-Pfad braucht's hier nicht.

interface ChangeBetBody {
  marketId: string;
  newOptionId: string;
  newOptionLabel: string;
  newAmount: number;       // 0 = Gratis-Tipp wechseln (keine Pool-Bewegung)
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAuth(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: ChangeBetBody;
  try { body = (await req.json()) as ChangeBetBody; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }

  const { marketId, newOptionId, newOptionLabel } = body;
  const newAmount = Math.max(0, Math.floor(Number(body.newAmount ?? 0)));

  if (!marketId || !newOptionId) return json({ error: 'marketId und newOptionId erforderlich.' }, 400);

  const db = getDb();
  const uid = auth.uid!;
  const betId = `${marketId}__${uid}`;
  const betRef = db.collection('bets').doc(betId);
  const playerRef = db.collection('players').doc(uid);
  const marketRef = db.collection('markets').doc(marketId);
  // Revisionssicheres Audit-Log jeder Änderung (eigene Collection, read-only
  // im Admin-Audit). Ref vorab anlegen, damit der Write in die Transaktion passt.
  const changeRef = db.collection('betChanges').doc();
  const now = Date.now();

  try {
    await db.runTransaction(async tx => {
      const [betSnap, playerSnap, marketSnap] = await Promise.all([
        tx.get(betRef),
        tx.get(playerRef),
        tx.get(marketRef),
      ]);

      if (!betSnap.exists) throw new Error('bet_not_found');
      if (!playerSnap.exists) throw new Error('player_not_found');
      if (!marketSnap.exists) throw new Error('market_not_found');

      const old = betSnap.data() as any;
      const p = playerSnap.data() as any;
      const m = marketSnap.data() as any;

      if (m.status !== 'open') throw new Error('market_not_open');
      if (typeof m.kickoffAt === 'number' && now >= m.kickoffAt) throw new Error('market_kickoff_passed');
      if (typeof m.betCloseAt === 'number' && now >= m.betCloseAt) throw new Error('market_closed');
      if (typeof m.expiresAt === 'number' && now > m.expiresAt) throw new Error('market_expired');

      const options = Array.isArray(m.options) ? (m.options as any[]) : [];
      const newOpt = options.find(o => o.id === newOptionId);
      if (!newOpt) throw new Error('option_not_found');

      // Mindest-/Höchsteinsatz auch beim Ändern erzwingen (serverseitig, da der
      // Slider umgangen werden kann). Gratis-/Jackpot-Tipps (newAmount == 0)
      // bleiben frei.
      if (newAmount > 0) {
        const minBet = Number(m.minBet ?? 0);
        const maxBet = Number(m.maxBet ?? 0);
        if (minBet > 0 && newAmount < minBet) throw new Error('below_min_bet');
        if (maxBet > 0 && newAmount > maxBet) throw new Error('above_max_bet');
      }

      const oldAmount = Number(old.amount ?? 0);
      const oldOptionId = String(old.optionId ?? '');
      const tokens = Number(p.tokens ?? 0);

      // Token-Saldo: alte Wette zurück, neue Wette abziehen.
      const tokenDelta = oldAmount - newAmount;
      const newTokens = tokens + tokenDelta;
      if (newTokens < 0) throw new Error('insufficient_tokens');

      // Pool-Buchung: alte Option entlasten, neue Option belasten — auch wenn
      // newAmount == oldAmount == 0 (Tipp-Wechsel ohne Einsatz) muss nichts passieren.
      if (oldAmount !== 0 || newAmount !== 0) {
        const newOptions = options.map(o => {
          let pool = Number(o.pool ?? 0);
          if (o.id === oldOptionId) pool -= oldAmount;
          if (o.id === newOptionId) pool += newAmount;
          return { ...o, pool };
        });
        tx.update(marketRef, { options: newOptions });
      }
      if (tokenDelta !== 0) {
        tx.update(playerRef, { tokens: newTokens });
      }

      tx.set(betRef, {
        id: betId,
        marketId,
        playerId: uid,
        optionId: newOptionId,
        optionLabel: newOptionLabel,
        amount: newAmount,
        timestamp: now,
        // Geänderte Wette liegt per Definition auf einem offenen Markt → muss
        // active bleiben, sonst fällt sie aus dem (auf active==true gefilterten)
        // Live-Listener. (tx.set überschreibt das Dokument vollständig.)
        active: true,
      });

      // Audit-Log der Änderung — rein additiv, beeinflusst Token-/Pool-Logik
      // nicht. Hält Vorher/Nachher + Token-Delta fest, damit Wett-Änderungen im
      // Admin-Audit nachvollziehbar sind (Debugging früherer Fehlbuchungen).
      tx.set(changeRef, {
        playerId: uid,
        marketId,
        ts: now,
        oldOptionId,
        oldOptionLabel: String(old.optionLabel ?? ''),
        oldAmount,
        newOptionId,
        newOptionLabel,
        newAmount,
        tokenDelta,
      });
    });

    return json({ ok: true });
  } catch (err: any) {
    const code = String(err?.message ?? 'unknown');
    return json({ error: errorMessage(code), code }, mapStatus(code));
  }
};

function errorMessage(code: string): string {
  switch (code) {
    case 'bet_not_found':            return 'Du hast hier noch nicht getippt.';
    case 'player_not_found':         return 'Spieler-Profil fehlt.';
    case 'market_not_found':         return 'Markt nicht gefunden.';
    case 'market_not_open':          return 'Markt ist nicht mehr offen.';
    case 'market_kickoff_passed':    return 'Anpfiff ist schon — keine Änderung mehr.';
    case 'market_closed':            return 'Annahmeschluss erreicht — keine Änderung mehr.';
    case 'market_expired':           return 'Tipp-Fenster geschlossen.';
    case 'option_not_found':         return 'Diese Option gibt es nicht.';
    case 'insufficient_tokens':      return 'Nicht genug Tokens für den neuen Einsatz.';
    case 'below_min_bet':            return 'Einsatz liegt unter dem Mindesteinsatz.';
    case 'above_max_bet':            return 'Einsatz liegt über dem Höchsteinsatz.';
    default:                          return 'Ändern fehlgeschlagen.';
  }
}
function mapStatus(code: string): number {
  if (code === 'player_not_found' || code === 'market_not_found' || code === 'bet_not_found' || code === 'option_not_found') return 404;
  return 409;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
