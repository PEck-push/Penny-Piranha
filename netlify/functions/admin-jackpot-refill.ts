import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';
import { logJackpotChange } from './_lib/jackpotLedger';

// ── Einmal-Tool: historisch aus dem Jackpot abgeflossene Boni nachrechnen und
// (optional) zurückerstatten. Hintergrund: Bis zur Umstellung „Jackpot wächst
// nur" wurden Streak-, Underdog- und Combo-Gewinn-Auszahlungen aus dem Jackpot
// gedeckt. Dieses Tool rekonstruiert die Summe und füllt den Jackpot wieder auf.
//
// POST { apply: false }  → Audit (Dry-Run): liefert die Aufschlüsselung.
// POST { apply: true }   → wendet die Rückerstattung einmalig an (Guard-Flag
//                          appState.bonusRefundApplied verhindert Doppelläufe).
//
// Quellen der Rekonstruktion:
//   - Streak-Boni:   Feed-Events (streak_on_fire = +30, streak_damn_hot = +100)
//   - Underdog-Boni: Re-Berechnung aufgelöster Märkte (gleiche Logik wie resolve)
//   - Combo-Gewinne: Auszahlung über den Einsatztopf hinaus bei geknackten Combos

const UNDERDOG_THRESHOLD = 0.15;
const UNDERDOG_BONUS = 0.1;
const round = (n: number) => Math.round(n);

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let apply = false;
  try { const b = await req.json(); apply = !!(b as any)?.apply; } catch { /* leerer Body = Audit */ }

  const db = getDb();
  try {
    const appRef = db.collection('appState').doc('global');
    const [appSnap, feedSnap, marketsSnap, betsSnap] = await Promise.all([
      appRef.get(),
      db.collection('feed').get(),
      db.collection('markets').get(),
      db.collection('bets').get(),
    ]);

    // Tipps nach Markt gruppieren (für die Underdog-/Combo-Rekonstruktion).
    const betsByMarket = new Map<string, any[]>();
    betsSnap.forEach(d => {
      const b = d.data() as any;
      const arr = betsByMarket.get(String(b.marketId)) ?? [];
      arr.push(b);
      betsByMarket.set(String(b.marketId), arr);
    });

    // 1) Streak-Boni aus dem Feed summieren.
    let streakTotal = 0, streakCount = 0;
    feedSnap.forEach(d => {
      const f = d.data() as any;
      if (f.type === 'streak_on_fire' || f.type === 'streak_damn_hot') {
        streakTotal += Number(f.creditsChange ?? 0);
        streakCount++;
      }
    });

    // 2) Underdog-Boni + 3) Combo-Gewinne durch Re-Berechnung der Märkte.
    let underdogTotal = 0, underdogMarkets = 0;
    let comboTotal = 0, comboWins = 0;

    marketsSnap.forEach(d => {
      const m = d.data() as any;
      if (m.status !== 'resolved') return;
      const bets = betsByMarket.get(d.id) ?? [];

      // Combo: Gewinn zahlt Einsatz × Multiplikator; der Teil über dem Einsatztopf
      // kam aus dem Jackpot.
      if (m.type === 'combo') {
        if (m.winningOptionId === 'combo-win') {
          const multiplier = Number(m.multiplier ?? 3);
          const totalPool = (m.options ?? []).reduce((s: number, o: any) => s + (o.pool || 0), 0);
          const comboBets = bets.filter(b => b.optionId === 'combo-win');
          const totalPayout = comboBets.reduce((s, b) => s + ((b.amount || 0) * multiplier), 0);
          const excess = Math.max(0, totalPayout - totalPool);
          if (excess > 0) { comboTotal += excess; comboWins++; }
        }
        return;
      }

      // Underdog gilt nur im klassischen Single-Pool-Pfad (keine Jackpot-Runde,
      // kein Multi-Select) und nur bei einer echten Auswertung mit Gewinnern.
      if (m.marketSubtype === 'jackpot' || m.multiSelect || !m.winningOptionId) return;

      const winningSet: string[] = Array.isArray(m.winningOptionIds) && m.winningOptionIds.length > 0
        ? m.winningOptionIds.filter(Boolean)
        : [m.winningOptionId];
      const totalPool = (m.options ?? []).reduce((s: number, o: any) => s + (o.pool || 0), 0);
      const winBets = bets.filter(b => winningSet.includes(b.optionId));
      const winPool = winBets.reduce((s, b) => s + (b.amount || 0), 0);
      if (winPool === 0 || winPool === totalPool) return; // no-winner / all-same-side → kein Underdog

      const lockedSnap: Record<string, number> = m.lockedPoolSnapshot ?? {};
      const lockedTotal = Object.values(lockedSnap).reduce((s: number, v: any) => s + Number(v), 0);
      const lockedWin = lockedSnap[m.winningOptionId] ?? winPool;
      const isUnderdog = lockedTotal > 0 && (lockedWin / lockedTotal) < UNDERDOG_THRESHOLD;
      if (!isUnderdog) return;

      let marketBonus = 0;
      for (const b of winBets) marketBonus += round((b.amount || 0) * UNDERDOG_BONUS);
      if (marketBonus > 0) { underdogTotal += marketBonus; underdogMarkets++; }
    });

    const total = streakTotal + underdogTotal + comboTotal;
    const currentJackpot = Number((appSnap.data() as any)?.jackpot ?? 0);
    const alreadyApplied = !!(appSnap.data() as any)?.bonusRefundApplied;

    const breakdown = {
      streakTotal, streakCount,
      underdogTotal, underdogMarkets,
      comboTotal, comboWins,
      total, currentJackpot,
      newJackpot: currentJackpot + total,
      alreadyApplied,
    };

    if (!apply) return json({ ok: true, applied: false, ...breakdown });

    if (alreadyApplied) return json({ ok: false, error: 'Rückerstattung wurde bereits angewendet.', ...breakdown }, 409);
    if (total <= 0) return json({ ok: false, error: 'Keine erstattbaren Boni gefunden.', ...breakdown }, 400);

    const batch = db.batch();
    batch.set(appRef, {
      jackpot: FieldValue.increment(total),
      bonusRefundApplied: true,
      bonusRefundAt: FieldValue.serverTimestamp(),
      bonusRefundAmount: total,
    }, { merge: true });
    logJackpotChange(batch, db, {
      delta: total,
      kind: 'bonus-refund',
      reason: `Rückerstattung historischer Boni (Streak ${streakTotal} + Underdog ${underdogTotal} + Combo ${comboTotal})`,
    });
    await batch.commit();

    return json({ ok: true, applied: true, ...breakdown });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Jackpot-Audit fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
