import { getDb, FieldValue } from './firebaseAdmin';

// WM 2026 resolution rules (from the implementation plan):
//   - Parimutuel payout with kaufmännischer Rundung (Math.round)
//   - Minimum win = stake + 2
//   - Underdog bonus +10% (from jackpot) if winning option had < 15% of locked pool
//   - No winner → whole pool to jackpot
//   - Streak update + ON FIRE (+30) / DAMN HOT (+100) bonuses
//   - unseenResolutions for the result-reveal screen
//   - feed entry

const MIN_WIN_BONUS = 2;
const UNDERDOG_THRESHOLD = 0.15;
const UNDERDOG_BONUS = 0.1;
const round = (n: number) => Math.round(n);

interface BetDoc {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;
  optionLabel?: string;
  amount: number;
}

export async function resolveMarketAdmin(
  marketId: string,
  winningOptionId: string,
  by: 'auto' | 'admin' = 'auto',
): Promise<{ ok: boolean; skipped?: boolean; payouts?: Record<string, number> }> {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const appRef = db.collection('appState').doc('global');

  const [marketSnap, appSnap] = await Promise.all([marketRef.get(), appRef.get()]);
  if (!marketSnap.exists) throw new Error(`market ${marketId} not found`);
  const market = marketSnap.data() as any;
  if (market.status === 'resolved' || market.status === 'cancelled') {
    return { ok: true, skipped: true };
  }

  const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
  const allBets: BetDoc[] = betsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const winBets = allBets.filter(b => b.optionId === winningOptionId);

  // ── Jackpot-Sonderrunde (einsatzfrei, fester Haus-Preis) ────────────────────
  // Korrekte Tipper teilen den festen Preis gleichmäßig. Die Finale-Headline
  // absorbiert zusätzlich den angesparten jackpot. Kein Streak/Underdog hier.
  if (market.marketSubtype === 'jackpot') {
    const currentJackpot = Number((appSnap.data() as any)?.jackpot ?? 0);
    const fixedPrize = Number(market.fixedPrize ?? 0);
    const prize = fixedPrize + (market.absorbsJackpotPot ? currentJackpot : 0);
    const n = winBets.length;
    const each = n > 0 ? Math.floor(prize / n) : 0;
    const paid = each * n;

    const batch = db.batch();
    batch.update(marketRef, {
      status: 'resolved',
      winningOptionId,
      resolutionType: 'normal',
      resolvedBy: by,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    const payouts: Record<string, number> = {};
    for (const b of winBets) {
      payouts[b.playerId] = (payouts[b.playerId] ?? 0) + each;
      batch.update(db.collection('players').doc(String(b.playerId)), {
        tokens: FieldValue.increment(each),
        unseenResolutions: FieldValue.arrayUnion(marketId),
      });
    }
    // Rest + ungeleerter Preis rollt in den jackpot; absorbierte Headline leert ihn.
    batch.update(appRef, { jackpot: FieldValue.increment(fixedPrize - paid) });
    const winLabel = (market.options ?? []).find((o: any) => o.id === winningOptionId)?.label ?? winningOptionId;
    batch.set(db.collection('feed').doc(), {
      type: 'jackpot_distribution',
      marketId,
      text: `🎰 Jackpot-Runde: ${market.question ?? marketId} → ${winLabel} (${each} TKN je Gewinner)`,
      ts: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, payouts };
  }

  const options: Array<{ id: string; label: string; pool: number }> = market.options ?? [];
  const totalPool = options.reduce((s, o) => s + (o.pool || 0), 0);
  const winPool = winBets.reduce((s, b) => s + (b.amount || 0), 0);
  const seed = market.initialSeedCredits ?? 0;
  const effectivePool = totalPool + seed;

  const lockedSnap: Record<string, number> = market.lockedPoolSnapshot ?? {};
  const lockedTotal = Object.values(lockedSnap).reduce((s: number, v: any) => s + Number(v), 0);
  const lockedWin = lockedSnap[winningOptionId] ?? winPool;
  const isUnderdog = lockedTotal > 0 && lockedWin / lockedTotal < UNDERDOG_THRESHOLD;

  const payouts: Record<string, number> = {};
  let jackpotDelta = 0;
  let resType: 'normal' | 'no-winner' | 'all-same-side' = 'normal';

  if (market.multiSelect) {
    // Exact-match: nur Tipps mit identischer Auswahl (kanonischer Key) gewinnen und
    // teilen den Gesamteinsatz anteilig. Kein Underdog (keine Pro-Option-Pools).
    const totalStake = allBets.reduce((s, b) => s + (b.amount || 0), 0);
    const winStake = winBets.reduce((s, b) => s + (b.amount || 0), 0);
    if (winStake === 0) {
      resType = 'no-winner';
      jackpotDelta += totalStake;
    } else {
      let paid = 0;
      for (const b of winBets) {
        const payout = Math.max(round((b.amount / winStake) * totalStake), b.amount + MIN_WIN_BONUS);
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + payout;
        paid += payout;
      }
      jackpotDelta += totalStake - paid;
    }
  } else if (winPool === 0) {
    // Kein Gewinner → ganzer Einsatz-Pool in den Jackpot. Seed verfällt.
    resType = 'no-winner';
    jackpotDelta += totalPool;
  } else if (winPool === totalPool) {
    // Alle auf derselben Seite: reine Einsatz-Rückzahlung, Jackpot unangetastet.
    resType = 'all-same-side';
    for (const b of winBets) payouts[b.playerId] = (payouts[b.playerId] ?? 0) + b.amount;
  } else {
    let paid = 0;
    for (const b of winBets) {
      const raw = (b.amount / winPool) * effectivePool;
      const payout = Math.max(round(raw), b.amount + MIN_WIN_BONUS);
      payouts[b.playerId] = (payouts[b.playerId] ?? 0) + payout;
      paid += payout;
    }
    if (isUnderdog) {
      for (const b of winBets) {
        const bonus = round(b.amount * UNDERDOG_BONUS);
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + bonus;
        jackpotDelta -= bonus;
      }
    }
    jackpotDelta += effectivePool - paid; // rounding remainder → jackpot
  }

  const batch = db.batch();
  batch.update(marketRef, {
    status: 'resolved',
    winningOptionId,
    resolutionType: resType,
    resolvedBy: by,
    resolvedAt: FieldValue.serverTimestamp(),
  });

  const bettorIds = [...new Set<string>(allBets.map(b => String(b.playerId)))];
  const playerSnaps = await Promise.all(
    bettorIds.map(id => db.collection('players').doc(id).get()),
  );

  const feedExtra: Array<{ type: string; playerId: string; playerName: string; text: string; creditsChange: number }> = [];

  for (const ps of playerSnaps) {
    if (!ps.exists) continue;
    const p = ps.data() as any;
    const myBet = allBets.find(b => b.playerId === ps.id);
    const correct = !!myBet && myBet.optionId === winningOptionId;
    const basePayout = payouts[ps.id] ?? 0;

    const newStreak = correct ? (p.currentStreak ?? 0) + 1 : 0;
    let level: 'none' | 'on_fire' | 'damn_hot' = 'none';
    if (newStreak >= 7) level = 'damn_hot';
    else if (newStreak >= 4) level = 'on_fire';

    // Streak milestone bonus (only on the exact threshold cross)
    let streakBonus = 0;
    const overlayAdds: string[] = [];
    if (correct && newStreak === 4) { streakBonus = 30; overlayAdds.push('on_fire'); }
    if (correct && newStreak === 7) { streakBonus = 100; overlayAdds.push('damn_hot'); }
    if (streakBonus > 0) {
      jackpotDelta -= streakBonus;
      feedExtra.push({
        type: newStreak === 7 ? 'streak_damn_hot' : 'streak_on_fire',
        playerId: ps.id,
        playerName: p.displayName ?? p.name ?? '?',
        text: newStreak === 7
          ? `🔥🔥 ${p.displayName ?? p.name} ist DAMN HOT! 7er-Streak! +100 Cr.`
          : `🔥 ${p.displayName ?? p.name} ist ON FIRE! 4er-Streak! +30 Cr.`,
        creditsChange: streakBonus,
      });
    }

    const upd: Record<string, any> = {
      tokens: FieldValue.increment(basePayout + streakBonus),
      currentStreak: newStreak,
      streakLevel: level,
      bestStreak: Math.max(p.bestStreak ?? 0, newStreak),
      unseenResolutions: FieldValue.arrayUnion(marketId),
      dailyNetGain: FieldValue.increment(basePayout - (myBet?.amount ?? 0)),
    };
    if (correct && isUnderdog) upd.underdogCorrect = FieldValue.increment(1);

    // Accessoires automatisch freischalten (rein kosmetisch, nicht auto-getragen).
    const accessoryAdds: string[] = [];
    if (correct && newStreak === 4) accessoryAdds.push('flames');        // Kopf: Flammen
    if (correct && isUnderdog)      accessoryAdds.push('underdog_medal'); // Hand: Underdog-Orden

    const allOverlayAdds = [...overlayAdds, ...accessoryAdds];
    if (allOverlayAdds.length > 0) upd.unlockedOverlays = FieldValue.arrayUnion(...allOverlayAdds);
    // activeBadgeId nur aus den Badge-Overlays (nicht aus Accessoires) setzen.
    if (overlayAdds.length > 0) upd.activeBadgeId = overlayAdds[overlayAdds.length - 1];

    batch.update(ps.ref, upd);
  }

  batch.update(appRef, { jackpot: FieldValue.increment(jackpotDelta) });

  const winLabel = options.find(o => o.id === winningOptionId)?.label ?? winningOptionId;
  const feedRef = db.collection('feed').doc();
  batch.set(feedRef, {
    type: 'market_resolved',
    marketId,
    text: `Ergebnis: ${market.question ?? marketId} → ${winLabel}`,
    ts: FieldValue.serverTimestamp(),
  });
  for (const f of feedExtra) {
    const ref = db.collection('feed').doc();
    batch.set(ref, { ...f, ts: FieldValue.serverTimestamp() });
  }

  await batch.commit();
  return { ok: true, payouts };
}

// ── Rollover: 50% Einsatz zurück, Rest → Jackpot (atomar) ─────────────────────
export async function rolloverMarketAdmin(marketId: string, by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const marketSnap = await marketRef.get();
  if (!marketSnap.exists) throw new Error(`market ${marketId} not found`);
  const market = marketSnap.data() as any;
  if (market.status === 'resolved' || market.status === 'cancelled') return { ok: true, skipped: true };

  const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
  const totalPool = (market.options ?? []).reduce((s: number, o: any) => s + (o.pool || 0), 0);

  const batch = db.batch();
  let refunded = 0;
  betsSnap.forEach(d => {
    const b = d.data() as any;
    const r = Math.floor((b.amount || 0) * 0.5);
    if (r > 0) {
      batch.update(db.collection('players').doc(String(b.playerId)), { tokens: FieldValue.increment(r) });
      refunded += r;
    }
  });
  batch.update(marketRef, {
    status: 'resolved', winningOptionId: null, resolutionType: 'rollover',
    resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(totalPool - refunded) });
  batch.set(db.collection('feed').doc(), {
    type: 'market_resolved', marketId,
    text: `🎰 Rollover: ${market.question ?? marketId} — 50% Einsatz zurück`,
    ts: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
}

// ── Storno: voller Einsatz zurück, Jackpot unangetastet (atomar) ──────────────
export async function stornoMarketAdmin(marketId: string, by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const marketSnap = await marketRef.get();
  if (!marketSnap.exists) throw new Error(`market ${marketId} not found`);
  const market = marketSnap.data() as any;
  if (market.status === 'resolved' || market.status === 'cancelled') return { ok: true, skipped: true };

  const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
  const batch = db.batch();
  betsSnap.forEach(d => {
    const b = d.data() as any;
    if ((b.amount || 0) > 0) {
      batch.update(db.collection('players').doc(String(b.playerId)), { tokens: FieldValue.increment(b.amount) });
    }
  });
  batch.update(marketRef, {
    status: 'cancelled', resolutionType: 'storno',
    resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('feed').doc(), {
    type: 'market_resolved', marketId,
    text: `↩️ Storno: ${market.question ?? marketId} — Einsätze zurück`,
    ts: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
}

// ── Offene Frage: Gewinner markieren (Belohnung vergibt Admin per giveTokens) ──
export async function resolveOpenQuestionAdmin(marketId: string, winnerPlayerIds: string[], by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const marketSnap = await marketRef.get();
  if (!marketSnap.exists) throw new Error(`market ${marketId} not found`);
  const market = marketSnap.data() as any;
  if (market.status === 'resolved' || market.status === 'cancelled') return { ok: true, skipped: true };

  const batch = db.batch();
  batch.update(marketRef, {
    status: 'resolved',
    winningOptionId: winnerPlayerIds.join(',') || null,
    resolutionType: 'normal',
    resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(),
  });
  for (const pid of winnerPlayerIds) {
    batch.update(db.collection('players').doc(String(pid)), { unseenResolutions: FieldValue.arrayUnion(marketId) });
  }
  batch.set(db.collection('feed').doc(), {
    type: 'market_resolved', marketId,
    text: `✏️ Auswertung: ${market.question ?? marketId}`,
    ts: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
}
