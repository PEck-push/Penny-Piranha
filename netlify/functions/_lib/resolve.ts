import { getDb, FieldValue } from './firebaseAdmin';

// WM 2026 resolution rules (from the implementation plan):
//   - Parimutuel payout with kaufmännischer Rundung (Math.round)
//   - Minimum win = stake + 2
//   - Underdog bonus +10% (from jackpot) if winning option had < 15% of locked pool
//   - No winner → whole pool to jackpot
//   - Streak update + ON FIRE (+30) / DAMN HOT (+100) bonuses
//   - unseenResolutions for the result-reveal screen
//   - feed entry
//
// IDEMPOTENZ / RACE-SCHUTZ: Jede Auflösung beansprucht den Markt zuerst atomar
// in einer Transaction (Status-Check + `resolveInProgress`-Flag). Zwei
// gleichzeitige Aufrufe (z. B. auto-resolve + manueller Admin-Klick) können so
// nicht beide auszahlen — der zweite bricht mit { skipped: true } ab.

const MIN_WIN_BONUS = 2;
const UNDERDOG_THRESHOLD = 0.15;
const UNDERDOG_BONUS = 0.1;
const round = (n: number) => Math.round(n);

// Spieltag-Schlüssel = Anpfiff-Datum in Europe/Vienna (YYYY-MM-DD). Dient nur als
// stabile Kennung eines Spieltags; spielfreie Tage erzeugen nie einen neuen Key.
function viennaDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

interface BetDoc {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;
  optionLabel?: string;
  amount: number;
}

// Optionaler End-Score, der vom auto-resolve mit übergeben wird (API-Daten).
// Wird im Feed-Text und am Markt-Doc als `finalScore` festgehalten.
export interface ResolveScore {
  home: number;
  away: number;
  duration?: string;          // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  penaltiesHome?: number | null;
  penaltiesAway?: number | null;
  teamA: string;
  teamB: string;
}

// Headline für den Feed. Wir lösen Märkte nach dem 90-Min-Stand auf
// (Wettbüro-1X2-Standard), daher zeigen wir IMMER `home:away` als 90-Min-Stand.
// Bei Verlängerung/Elfern hängen wir den Verlauf transparent dran, damit klar
// ist: die Wette ist nach 90 Min entschieden, das Spiel ging aber weiter.
function formatScoreLine(s: ResolveScore): string {
  const base = `${s.teamA} ${s.home}:${s.away} ${s.teamB}`;
  if (s.duration === 'PENALTY_SHOOTOUT' && s.penaltiesHome != null && s.penaltiesAway != null) {
    return `${base} (n. 90 Min · i. E. ${s.penaltiesHome}:${s.penaltiesAway})`;
  }
  if (s.duration === 'EXTRA_TIME') return `${base} (n. 90 Min · entschieden i. d. Verlängerung)`;
  return base;
}

// Persistiert den tatsächlich ausgezahlten Betrag pro Bet, damit der Client im
// Verlauf nicht nachträglich neu rechnen muss (ehrliche Anzeige inkl. Mindest-
// garantie und Underdog-Bonus, exklusive Streak-Boni).
function persistBetPayouts(batch: FirebaseFirestore.WriteBatch, payoutsByBet: Map<string, number>) {
  const db = getDb();
  for (const [betId, payout] of payoutsByBet) {
    batch.update(db.collection('bets').doc(betId), { payout });
  }
}

// Beansprucht einen Markt atomar zur Bearbeitung. Liefert die Marktdaten, wenn
// erfolgreich beansprucht, sonst null (bereits aufgelöst/storniert/in Arbeit).
async function claimMarket(marketRef: FirebaseFirestore.DocumentReference): Promise<any | null> {
  const db = getDb();
  return db.runTransaction(async tx => {
    const s = await tx.get(marketRef);
    if (!s.exists) throw new Error(`market ${marketRef.id} not found`);
    const m = s.data() as any;
    if (m.status === 'resolved' || m.status === 'cancelled' || m.resolveInProgress === true) {
      return null;
    }
    tx.update(marketRef, { resolveInProgress: true });
    return m;
  });
}

// Setzt das In-Arbeit-Flag bei Fehlern zurück, damit ein Markt nicht hängenbleibt.
async function releaseClaim(marketRef: FirebaseFirestore.DocumentReference): Promise<void> {
  try { await marketRef.update({ resolveInProgress: false }); } catch { /* egal */ }
}

export async function resolveMarketAdmin(
  marketId: string,
  winningOptionId: string,
  by: 'auto' | 'admin' = 'auto',
  score?: ResolveScore,
): Promise<{ ok: boolean; skipped?: boolean; payouts?: Record<string, number> }> {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const appRef = db.collection('appState').doc('global');

  const market = await claimMarket(marketRef);
  if (!market) return { ok: true, skipped: true };

  try {
    // ── Spieltag-Wechsel: Tagesbilanz (dailyNetGain) nur an Tagen mit echten
    // Spielen zurücksetzen — NICHT an spielfreien Tagen. Schlüssel = Anpfiff-
    // Datum (Europe/Vienna) des aufgelösten WM-Spiels. Beim ersten Spiel eines
    // neuen Spieltags wird per CAS-Transaction die Bilanz aller Spieler genullt,
    // bevor die Ergebnisse dieses Spieltags verbucht werden. So bleibt zwischen
    // den Spieltagen der letzte Spieltagssieger gekrönt.
    if (market.marketSubtype === 'wm-match' && typeof market.kickoffAt === 'number') {
      const matchdayKey = viennaDateKey(market.kickoffAt);
      const isNewMatchday = await db.runTransaction(async tx => {
        const s = await tx.get(appRef);
        const cur = (s.data() as any)?.currentMatchday ?? '';
        if (cur === matchdayKey) return false;
        tx.set(appRef, { currentMatchday: matchdayKey }, { merge: true });
        return true;
      });
      if (isNewMatchday) {
        const playersSnap = await db.collection('players').get();
        let rb = db.batch();
        let rn = 0;
        for (const d of playersSnap.docs) {
          rb.update(d.ref, { dailyNetGain: 0 });
          if (++rn >= 400) { await rb.commit(); rb = db.batch(); rn = 0; }
        }
        if (rn > 0) await rb.commit();
      }
    }

    const appSnap = await appRef.get();

    const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
    const allBets: BetDoc[] = betsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const winBets = allBets.filter(b => b.optionId === winningOptionId);

    // ── Jackpot-Sonderrunde (einsatzfrei, fester Haus-Preis) ──────────────────
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
        resolveInProgress: false,
      });
      const payouts: Record<string, number> = {};
      const betPayouts = new Map<string, number>();
      for (const b of winBets) {
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + each;
        betPayouts.set(b.id, each);
        batch.update(db.collection('players').doc(String(b.playerId)), {
          tokens: FieldValue.increment(each),
          dailyNetGain: FieldValue.increment(each),
          unseenResolutions: FieldValue.arrayUnion(marketId),
        });
      }
      // Auch die Verlierer-Bets als „verloren" markieren (payout 0), für die Anzeige.
      for (const b of allBets) if (!betPayouts.has(b.id)) betPayouts.set(b.id, 0);
      persistBetPayouts(batch, betPayouts);
      // Delta = fixedPrize − paid (gilt für beide Fälle): nicht ausgezahlter Rest
      // des Festpreises rollt in den jackpot. Beim Absorbieren wird der angesparte
      // Pot Teil von `prize` und damit ausgeschüttet — der Saldo bleibt fixedPrize−paid.
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

    // ── Combo (Parlay): alle Legs richtig → Einsatz × Multiplikator, sonst Einsatz
    // verloren (→ Jackpot). Self-contained; kein Streak/Underdog. winningOptionId
    // 'combo-win' = gewonnen, sonst (z. B. 'combo-miss') = gescheitert.
    if (market.type === 'combo') {
      const multiplier = Number(market.multiplier ?? 3);
      const won = winningOptionId === 'combo-win';
      const comboBets = allBets.filter(b => b.optionId === 'combo-win');

      const batch = db.batch();
      const payouts: Record<string, number> = {};
      const betPayouts = new Map<string, number>();
      let totalPayout = 0;
      for (const b of comboBets) {
        const playerRef = db.collection('players').doc(String(b.playerId));
        if (won) {
          const payout = (b.amount || 0) * multiplier;
          payouts[b.playerId] = (payouts[b.playerId] ?? 0) + payout;
          betPayouts.set(b.id, payout);
          totalPayout += payout;
          batch.update(playerRef, {
            tokens: FieldValue.increment(payout),
            dailyNetGain: FieldValue.increment(payout - (b.amount || 0)),
            unseenResolutions: FieldValue.arrayUnion(marketId),
          });
        } else {
          // Einsatz wurde beim Tippen bereits abgezogen → nur Tagesbilanz/Reveal.
          betPayouts.set(b.id, 0);
          batch.update(playerRef, {
            dailyNetGain: FieldValue.increment(-(b.amount || 0)),
            unseenResolutions: FieldValue.arrayUnion(marketId),
          });
        }
      }
      persistBetPayouts(batch, betPayouts);
      // Gewinn: Mehrbetrag über den Einsatztopf hinaus kommt aus dem Jackpot/Haus.
      // Niederlage: die Einsätze wandern in den Jackpot.
      const jackpotDelta = won ? -Math.max(0, totalPayout - totalPool) : totalPool;
      const legs = (market.comboLegs ?? []).map((l: any) => ({
        ...l, status: won ? 'hit' : (l.status === 'pending' ? 'miss' : l.status),
      }));
      batch.update(marketRef, {
        status: 'resolved',
        winningOptionId: won ? 'combo-win' : 'combo-miss',
        resolutionType: won ? 'normal' : 'no-winner',
        resolvedBy: by,
        resolvedAt: FieldValue.serverTimestamp(),
        resolveInProgress: false,
        comboLegs: legs,
      });
      batch.update(appRef, { jackpot: FieldValue.increment(jackpotDelta) });
      batch.set(db.collection('feed').doc(), {
        type: 'market_resolved', marketId,
        text: won
          ? `🔗 Combo geknackt: ${market.question ?? marketId} (×${multiplier})`
          : `🔗 Combo gescheitert: ${market.question ?? marketId}`,
        ts: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, payouts };
    }

    const winPool = winBets.reduce((s, b) => s + (b.amount || 0), 0);
    const seed = market.initialSeedCredits ?? 0;
    const effectivePool = totalPool + seed;

    const lockedSnap: Record<string, number> = market.lockedPoolSnapshot ?? {};
    const lockedTotal = Object.values(lockedSnap).reduce((s: number, v: any) => s + Number(v), 0);
    const lockedWin = lockedSnap[winningOptionId] ?? winPool;
    const isUnderdog = lockedTotal > 0 && lockedWin / lockedTotal < UNDERDOG_THRESHOLD;

    const payouts: Record<string, number> = {};
    const betPayouts = new Map<string, number>();
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
          betPayouts.set(b.id, payout);
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
      for (const b of winBets) {
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + b.amount;
        betPayouts.set(b.id, b.amount);
      }
    } else {
      let paid = 0;
      for (const b of winBets) {
        const raw = (b.amount / winPool) * effectivePool;
        const payout = Math.max(round(raw), b.amount + MIN_WIN_BONUS);
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + payout;
        betPayouts.set(b.id, payout);
        paid += payout;
      }
      if (isUnderdog) {
        for (const b of winBets) {
          const bonus = round(b.amount * UNDERDOG_BONUS);
          payouts[b.playerId] = (payouts[b.playerId] ?? 0) + bonus;
          betPayouts.set(b.id, (betPayouts.get(b.id) ?? 0) + bonus);
          jackpotDelta -= bonus;
        }
      }
      jackpotDelta += effectivePool - paid; // rounding remainder → jackpot
    }
    // Verlierer-Bets als 0 markieren (für Anzeige im Verlauf).
    for (const b of allBets) if (!betPayouts.has(b.id)) betPayouts.set(b.id, 0);

    const batch = db.batch();
    const finalScorePersist = score ? {
      home: score.home,
      away: score.away,
      ...(score.duration ? { duration: score.duration } : {}),
      ...(score.penaltiesHome != null ? { penaltiesHome: score.penaltiesHome } : {}),
      ...(score.penaltiesAway != null ? { penaltiesAway: score.penaltiesAway } : {}),
    } : null;
    batch.update(marketRef, {
      status: 'resolved',
      winningOptionId,
      resolutionType: resType,
      resolvedBy: by,
      resolvedAt: FieldValue.serverTimestamp(),
      resolveInProgress: false,
      ...(finalScorePersist ? { finalScore: finalScorePersist } : {}),
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
    persistBetPayouts(batch, betPayouts);

    const winLabel = options.find(o => o.id === winningOptionId)?.label ?? winningOptionId;
    const headline = score ? formatScoreLine(score) : (market.question ?? marketId);
    const feedRef = db.collection('feed').doc();
    batch.set(feedRef, {
      type: 'market_resolved',
      marketId,
      text: `Ergebnis: ${headline} → ${winLabel}`,
      ts: FieldValue.serverTimestamp(),
    });
    for (const f of feedExtra) {
      const ref = db.collection('feed').doc();
      batch.set(ref, { ...f, ts: FieldValue.serverTimestamp() });
    }

    await batch.commit();
    return { ok: true, payouts };
  } catch (err) {
    await releaseClaim(marketRef);
    throw err;
  }
}

// ── Rollover: 50% Einsatz zurück, Rest → Jackpot (atomar) ─────────────────────
export async function rolloverMarketAdmin(marketId: string, by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);

  const market = await claimMarket(marketRef);
  if (!market) return { ok: true, skipped: true };

  try {
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
      batch.update(d.ref, { payout: r });
    });
    batch.update(marketRef, {
      status: 'resolved', winningOptionId: null, resolutionType: 'rollover',
      resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(), resolveInProgress: false,
    });
    batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(totalPool - refunded) });
    batch.set(db.collection('feed').doc(), {
      type: 'market_resolved', marketId,
      text: `🎰 Rollover: ${market.question ?? marketId} — 50% Einsatz zurück`,
      ts: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true };
  } catch (err) {
    await releaseClaim(marketRef);
    throw err;
  }
}

// ── Storno: voller Einsatz zurück, Jackpot unangetastet (atomar) ──────────────
export async function stornoMarketAdmin(marketId: string, by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);

  const market = await claimMarket(marketRef);
  if (!market) return { ok: true, skipped: true };

  try {
    const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
    const batch = db.batch();
    betsSnap.forEach(d => {
      const b = d.data() as any;
      if ((b.amount || 0) > 0) {
        batch.update(db.collection('players').doc(String(b.playerId)), { tokens: FieldValue.increment(b.amount) });
      }
      batch.update(d.ref, { payout: b.amount || 0 });
    });
    batch.update(marketRef, {
      status: 'cancelled', resolutionType: 'storno',
      resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(), resolveInProgress: false,
    });
    batch.set(db.collection('feed').doc(), {
      type: 'market_resolved', marketId,
      text: `↩️ Storno: ${market.question ?? marketId} — Einsätze zurück`,
      ts: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true };
  } catch (err) {
    await releaseClaim(marketRef);
    throw err;
  }
}

// ── Offene Frage: Gewinner markieren (Belohnung vergibt Admin per giveTokens) ──
export async function resolveOpenQuestionAdmin(marketId: string, winnerPlayerIds: string[], by: 'auto' | 'admin' = 'admin') {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);

  const market = await claimMarket(marketRef);
  if (!market) return { ok: true, skipped: true };

  try {
    const batch = db.batch();
    batch.update(marketRef, {
      status: 'resolved',
      winningOptionId: winnerPlayerIds.join(',') || null,
      resolutionType: 'normal',
      resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(), resolveInProgress: false,
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
  } catch (err) {
    await releaseClaim(marketRef);
    throw err;
  }
}
