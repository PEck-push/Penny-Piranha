import { getDb, FieldValue } from './firebaseAdmin';
import { logJackpotChange } from './jackpotLedger';

// ─── Einmalige Korrektur einer FEHLERHAFTEN Auflösung (Standard-Markt) ─────────
//
// Anwendungsfall: Ein Markt wurde bereits auf eine FALSCHE Gewinner-Option
// aufgelöst (z. B. „Sieg Iran" statt „Unentschieden", weil die Daten-API ein
// falsches Ergebnis lieferte) und die Tokens wurden ausgezahlt. Diese Funktion
// bucht die alte Auflösung sauber zurück und löst den Markt auf die richtige
// Option neu auf — inklusive:
//   • Parimutuel-Auszahlung (exakt, inkl. Underdog-Bonus) — alte zurück, neue rein
//   • Tagesbilanz (dailyNetGain / matchdayNetGain → Tagessieger)
//   • Jackpot (Pool-Rest/Rundung der Auswertung)
//   • Streak-Meilenstein-Boni (+30 / +100), differenzgenau über die Tipp-Historie
//   • Streak-Zähler (currentStreak / bestStreak / streakLevel / activeBadgeId)
//     + Underdog-Zähler — komplett aus der korrigierten Historie neu berechnet
//
// NUR für Standard-Märkte (1X2 / einfache Einzeloption). Multi-Winner-,
// Multiple-Choice-, Combo-, Jackpot- und offene-Frage-Märkte werden abgelehnt.
//
// IMMER zuerst mit dryRun=true laufen lassen → liefert einen vollständigen
// Report (pro Spieler-Delta, Summen, Jackpot) OHNE etwas zu schreiben.

const MIN_WIN_BONUS = 2;
const UNDERDOG_THRESHOLD = 0.15;
const UNDERDOG_BONUS = 0.1;
const round = (n: number) => Math.round(n);

interface BetDoc {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;
  amount: number;
  payout?: number;
}

type ResType = 'normal' | 'no-winner' | 'all-same-side';

// Parimutuel-Auszahlung für eine HYPOTHETISCHE Gewinner-Option — deckungsgleich
// zur Live-Auflösung (resolve.ts, Standard-Pfad). Liefert pro Bet die
// Auszahlung (inkl. Underdog-Bonus), den Jackpot-Delta (NUR Pool-Rest, Boni
// deckt das Haus) und den Auflösungstyp.
function computeStandardPayouts(market: any, allBets: BetDoc[], winningOptionId: string) {
  const options: Array<{ id: string; pool: number }> = market.options ?? [];
  const totalPool = options.reduce((s, o) => s + (o.pool || 0), 0);
  const seed = market.initialSeedCredits ?? 0;
  const effectivePool = totalPool + seed;

  const winBets = allBets.filter(b => b.optionId === winningOptionId);
  const winPool = winBets.reduce((s, b) => s + (b.amount || 0), 0);

  const lockedSnap: Record<string, number> = market.lockedPoolSnapshot ?? {};
  const lockedTotal = Object.values(lockedSnap).reduce((s: number, v: any) => s + Number(v), 0);
  const lockedWin = lockedSnap[winningOptionId] ?? winPool;
  const isUnderdog = lockedTotal > 0 && lockedWin / lockedTotal < UNDERDOG_THRESHOLD;

  const betPayout = new Map<string, number>();
  let resType: ResType = 'normal';
  let jackpotDelta = 0;

  if (winPool === 0) {
    resType = 'no-winner';
    jackpotDelta = totalPool + seed; // Seed (Auto-Abzug) als Fallback in den Jackpot
  } else if (winPool === totalPool && seed <= 0) {
    resType = 'all-same-side';
    for (const b of winBets) betPayout.set(b.id, b.amount);
    // jackpotDelta = 0 (reine Rückzahlung, Jackpot unangetastet)
  } else {
    let paidBase = 0;
    for (const b of winBets) {
      const raw = (b.amount / winPool) * effectivePool;
      const p = Math.max(round(raw), b.amount + MIN_WIN_BONUS);
      betPayout.set(b.id, p);
      paidBase += p;
    }
    if (isUnderdog) {
      for (const b of winBets) {
        const bonus = round(b.amount * UNDERDOG_BONUS);
        betPayout.set(b.id, (betPayout.get(b.id) ?? 0) + bonus); // Haus-gedeckt
      }
    }
    jackpotDelta = effectivePool - paidBase; // Boni NICHT abgezogen (Haus deckt)
  }
  for (const b of allBets) if (!betPayout.has(b.id)) betPayout.set(b.id, 0);
  return { betPayout, jackpotDelta, resType, isUnderdog };
}

const isUnderdogFor = (market: any, winningOptionId: string, winBetsPool: number): boolean => {
  const lockedSnap: Record<string, number> = market.lockedPoolSnapshot ?? {};
  const lockedTotal = Object.values(lockedSnap).reduce((s: number, v: any) => s + Number(v), 0);
  const lockedWin = lockedSnap[winningOptionId] ?? winBetsPool;
  return lockedTotal > 0 && lockedWin / lockedTotal < UNDERDOG_THRESHOLD;
};

const resolvedMillis = (m: any): number => {
  const ts = m?.resolvedAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof m?.kickoffAt === 'number') return m.kickoffAt;
  return 0;
};

// Markt zählt für den Streak-Lauf? (deckungsgleich zur Streak-Logik in
// resolve.ts: nur „echte" Standard-Auflösungen ticken — kein Jackpot/Combo/
// offene Frage, und resType muss 'normal' sein.)
const streakRelevantStored = (m: any): boolean =>
  m?.resolutionType === 'normal'
  && m?.type !== 'combo'
  && m?.marketSubtype !== 'jackpot'
  && !m?.isOpenQuestion;

export interface CorrectionPlayerRow {
  playerId: string;
  name: string;
  oldPayout: number;
  newPayout: number;
  milestoneDelta: number;
  tokenDelta: number;       // inkl. milestoneDelta
  netGainDelta: number;     // ohne milestone (nur Auszahlung − Einsatz)
  oldStreak: number | null;
  newStreak: number;
}

export interface CorrectionReport {
  ok: boolean;
  dryRun: boolean;
  marketId: string;
  question: string;
  oldWinningOptionId: string | null;
  oldWinningLabel: string;
  newWinningOptionId: string;
  newWinningLabel: string;
  newResType: ResType;
  jackpotDelta: number;
  totalTokenDelta: number;
  affectedPlayers: number;
  rows: CorrectionPlayerRow[];
  scoreSet?: { home: number; away: number } | null; // gesetztes Ergebnis (Spielplan-Tabelle)
  note?: string;
}

export async function correctMatchResolution(
  marketId: string,
  newWinningOptionId: string,
  opts: { dryRun: boolean; score?: { home: number; away: number }; extraTime?: { home: number; away: number }; penalties?: { home: number; away: number } } = { dryRun: true },
): Promise<CorrectionReport> {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const mSnap = await marketRef.get();
  if (!mSnap.exists) throw new Error('Markt nicht gefunden.');
  const market = mSnap.data() as any;

  // ── Vorbedingungen / Sicherheitsnetze ─────────────────────────────────────
  if (market.status !== 'resolved') throw new Error(`Markt ist nicht 'resolved' (Status: ${market.status}). Nur fehlerhaft aufgelöste Märkte korrigieren.`);
  if (market.type === 'combo') throw new Error('Combo-Märkte werden nicht unterstützt.');
  if (market.marketSubtype === 'jackpot') throw new Error('Jackpot-/Gratis-Runden werden nicht unterstützt.');
  if (market.isOpenQuestion) throw new Error('Offene-Frage-Märkte werden nicht unterstützt.');
  if (market.multiSelect) throw new Error('Multiple-Choice-Märkte werden nicht unterstützt.');
  if (Array.isArray(market.winningOptionIds) && market.winningOptionIds.length > 1) throw new Error('Multi-Winner-Märkte werden nicht unterstützt.');

  const options: Array<{ id: string; label: string }> = market.options ?? [];
  if (!options.some(o => o.id === newWinningOptionId)) throw new Error(`Option '${newWinningOptionId}' gibt es in diesem Markt nicht.`);

  const oldWinningOptionId: string | null = market.winningOptionId ?? null;
  const oldResType: ResType = (market.resolutionType as ResType) ?? 'normal';
  const labelOf = (id: string | null) => options.find(o => o.id === id)?.label ?? (id ?? '—');

  // ── Sonderfall: Gewinner-Option stimmt bereits — nur das Ergebnis (Score)
  // soll korrigiert werden (Spielplan-Tabelle). Keine Token-/Streak-Umbuchung.
  if (oldWinningOptionId === newWinningOptionId) {
    if ((!opts.score && !opts.penalties && !opts.extraTime) || market.marketSubtype !== 'wm-match') {
      throw new Error('Der Markt ist bereits auf diese Option aufgelöst — und kein (anderes) Ergebnis/Verlängerung/Elfer zu setzen.');
    }
    // 90-Min-Stand: aus Eingabe, sonst bestehender finalScore.
    const fsOld = market.finalScore ?? {};
    const h = opts.score ? opts.score.home : Number(fsOld.home ?? 0);
    const a = opts.score ? opts.score.away : Number(fsOld.away ?? 0);
    const et = opts.extraTime ?? null;                                   // Endstand n. V.
    const pens = opts.penalties && opts.penalties.home !== opts.penalties.away ? opts.penalties : null;
    const teamA = market.teamA ?? 'Heim';
    const teamB = market.teamB ?? 'Gast';
    const winLabel = labelOf(newWinningOptionId);
    const base = `${teamA} ${h}:${a} ${teamB}`;
    const parts: string[] = [];
    if (et) parts.push(`n. V. ${et.home}:${et.away}`);
    if (pens) parts.push(`i. E. ${pens.home}:${pens.away}`);
    const suffix = parts.length ? ` (n. 90 Min · ${parts.join(' · ')})` : '';
    const newText = `Ergebnis: ${base}${suffix} → ${winLabel}`;

    const scoreOnly: CorrectionReport = {
      ok: true, dryRun: opts.dryRun, marketId, question: market.question ?? marketId,
      oldWinningOptionId, oldWinningLabel: labelOf(oldWinningOptionId),
      newWinningOptionId, newWinningLabel: labelOf(newWinningOptionId),
      newResType: oldResType, jackpotDelta: 0, totalTokenDelta: 0, affectedPlayers: 0,
      rows: [], scoreSet: { home: h, away: a },
    };
    if (opts.dryRun) {
      scoreOnly.note = `Probelauf — Gewinner unverändert. Feed/Ergebnis würde lauten: „${newText}".`;
      return scoreOnly;
    }
    const schedDocId: string | undefined =
      (typeof market.matchId === 'string' && market.matchId) ||
      (typeof market.footballDataOrgId === 'number' ? `wc-${market.footballDataOrgId}` : undefined);
    const batch = db.batch();
    const fsNew: Record<string, any> = { home: h, away: a };
    if (et) { fsNew.extraTimeHome = et.home; fsNew.extraTimeAway = et.away; }
    if (pens) { fsNew.duration = 'PENALTY_SHOOTOUT'; fsNew.penaltiesHome = pens.home; fsNew.penaltiesAway = pens.away; }
    else if (et) { fsNew.duration = 'EXTRA_TIME'; }
    else if (fsOld.duration) { fsNew.duration = fsOld.duration; }
    batch.update(marketRef, { finalScore: fsNew });
    if (opts.score && schedDocId) {
      batch.set(db.collection('schedule').doc(schedDocId),
        // scoreCorrected: schützt das manuell korrigierte Ergebnis vor künftigen
        // API-Re-Importen (import-schedule überspringt markierte Docs).
        { scoreA: h, scoreB: a, status: 'finished', scoreCorrected: true }, { merge: true });
    }
    // Bestehende Auflöse-Feed-Einträge dieses Markts umschreiben (statt neuen
    // Eintrag anzulegen) — so wird die falsche i.E.-Zeile rückwirkend korrigiert.
    const feedSnap = await db.collection('feed').where('marketId', '==', marketId).get();
    let rewrote = 0;
    feedSnap.forEach(d => {
      const dd = d.data() as any;
      if (dd.type === 'market_resolved' && !String(dd.text ?? '').startsWith('🛠️')) { batch.update(d.ref, { text: newText }); rewrote++; }
    });
    if (rewrote === 0) {
      batch.set(db.collection('feed').doc(), { type: 'market_resolved', marketId, text: newText, ts: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    scoreOnly.note = `Korrigiert: „${newText}"` + (rewrote ? ` (${rewrote} Feed-Eintrag/-Einträge aktualisiert).` : ' (neuer Feed-Eintrag).');
    return scoreOnly;
  }

  // ── Bets dieses Marktes ────────────────────────────────────────────────────
  const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
  const allBets: BetDoc[] = betsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // Neue Auszahlung berechnen.
  const neu = computeStandardPayouts(market, allBets, newWinningOptionId);
  const oldComputed = computeStandardPayouts(market, allBets, oldWinningOptionId ?? '__none__');
  const jackpotDelta = neu.jackpotDelta - oldComputed.jackpotDelta;

  // Underdog-Flags des Ziel-Marktes (alt/neu) für die Historien-Läufe.
  const newWinPool = allBets.filter(b => b.optionId === newWinningOptionId).reduce((s, b) => s + (b.amount || 0), 0);
  const oldWinPool = allBets.filter(b => b.optionId === oldWinningOptionId).reduce((s, b) => s + (b.amount || 0), 0);
  const targetNewIsUnderdog = neu.resType === 'normal' && isUnderdogFor(market, newWinningOptionId, newWinPool);
  const targetOldIsUnderdog = oldResType === 'normal' && isUnderdogFor(market, oldWinningOptionId ?? '', oldWinPool);

  // ── Betroffene Spieler = alle Tipper dieses Marktes ────────────────────────
  const playerIds = [...new Set(allBets.map(b => String(b.playerId)))];

  // Alle Märkte einmal laden (für die Streak-Historie der Spieler).
  const allMarketsSnap = await db.collection('markets').get();
  const marketsById = new Map<string, any>();
  allMarketsSnap.forEach(d => marketsById.set(d.id, { id: d.id, ...(d.data() as any) }));

  // Streak-/Meilenstein-Lauf über die Tipp-Historie EINES Spielers.
  // targetWinningId/targetResType/targetIsUnderdog beschreiben das Ziel-Spiel
  // in DIESEM Szenario (alt ODER neu) — alle anderen Spiele bleiben unverändert.
  const walk = (
    playerBets: BetDoc[],
    targetWinningId: string,
    targetResType: ResType,
    targetIsUnderdog: boolean,
  ) => {
    const entries: Array<{ t: number; correct: boolean; underdog: boolean }> = [];
    for (const b of playerBets) {
      const m = marketsById.get(b.marketId);
      if (!m) continue;
      let winId: string; let isU: boolean;
      if (b.marketId === marketId) {
        if (targetResType !== 'normal') continue; // tickt nicht
        winId = targetWinningId; isU = targetIsUnderdog;
      } else {
        if (!streakRelevantStored(m)) continue;
        winId = m.winningOptionId;
        const wp = 0; // pool egal: lockedSnap[winId] hat Vorrang; Fallback nur wenn fehlt
        isU = isUnderdogFor(m, winId, wp);
      }
      entries.push({ t: resolvedMillis(m), correct: b.optionId === winId, underdog: isU });
    }
    entries.sort((a, b) => a.t - b.t);
    let streak = 0, best = 0, milestone = 0, udc = 0;
    for (const e of entries) {
      streak = e.correct ? streak + 1 : 0;
      best = Math.max(best, streak);
      if (e.correct && streak === 4) milestone += 30;
      if (e.correct && streak === 7) milestone += 100;
      if (e.correct && e.underdog) udc++;
    }
    return { streak, best, milestone, udc };
  };

  // Pro Spieler dessen Tipps (alle Märkte) laden.
  const playerBetsMap = new Map<string, BetDoc[]>();
  await Promise.all(playerIds.map(async pid => {
    const s = await db.collection('bets').where('playerId', '==', pid).get();
    playerBetsMap.set(pid, s.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
  }));

  // Spieler-Dokumente (für Namen).
  const playerSnaps = await Promise.all(playerIds.map(pid => db.collection('players').doc(pid).get()));
  const nameById = new Map<string, string>();
  for (const ps of playerSnaps) {
    const d = ps.data() as any;
    nameById.set(ps.id, d?.displayName ?? d?.name ?? ps.id);
  }

  const rows: CorrectionPlayerRow[] = [];
  const updatesByPlayer = new Map<string, Record<string, any>>();

  for (const pid of playerIds) {
    const pBets = playerBetsMap.get(pid) ?? [];
    const myMarketBets = allBets.filter(b => String(b.playerId) === pid);
    const oldPayout = myMarketBets.reduce((s, b) => s + (b.payout ?? 0), 0);
    const newPayout = myMarketBets.reduce((s, b) => s + (neu.betPayout.get(b.id) ?? 0), 0);

    const newWalk = walk(pBets, newWinningOptionId, neu.resType, targetNewIsUnderdog);
    const oldWalk = walk(pBets, oldWinningOptionId ?? '__none__', oldResType, targetOldIsUnderdog);
    const milestoneDelta = newWalk.milestone - oldWalk.milestone;

    const netGainDelta = newPayout - oldPayout;
    const tokenDelta = netGainDelta + milestoneDelta;

    const level: 'none' | 'on_fire' | 'damn_hot' = newWalk.streak >= 7 ? 'damn_hot' : newWalk.streak >= 4 ? 'on_fire' : 'none';

    // Underdog-Badge (24 h) nur bezogen aufs Ziel-Spiel anpassen.
    const myBet = myMarketBets[0];
    const newCorrectUnderdogTarget = targetNewIsUnderdog && !!myBet && myBet.optionId === newWinningOptionId;
    const oldCorrectUnderdogTarget = targetOldIsUnderdog && !!myBet && myBet.optionId === (oldWinningOptionId ?? '');

    const upd: Record<string, any> = {
      tokens: FieldValue.increment(tokenDelta),
      dailyNetGain: FieldValue.increment(netGainDelta),
      matchdayNetGain: FieldValue.increment(netGainDelta),
      unseenResolutions: FieldValue.arrayUnion(marketId),
      currentStreak: newWalk.streak,
      bestStreak: newWalk.best,
      streakLevel: level,
      activeBadgeId: level === 'none' ? null : level,
      underdogCorrect: newWalk.udc,
    };
    if (newWalk.streak >= 4) upd.unlockedOverlays = FieldValue.arrayUnion('flames', 'on_fire');
    if (newWalk.streak >= 7) upd.unlockedOverlays = FieldValue.arrayUnion('flames', 'on_fire', 'damn_hot');
    if (newCorrectUnderdogTarget) upd.underdogBadgeAt = Date.now();
    else if (oldCorrectUnderdogTarget) upd.underdogBadgeAt = FieldValue.delete();

    updatesByPlayer.set(pid, upd);
    rows.push({
      playerId: pid,
      name: nameById.get(pid) ?? pid,
      oldPayout,
      newPayout,
      milestoneDelta,
      tokenDelta,
      netGainDelta,
      oldStreak: oldWalk.streak,
      newStreak: newWalk.streak,
    });
  }

  rows.sort((a, b) => b.tokenDelta - a.tokenDelta);
  const totalTokenDelta = rows.reduce((s, r) => s + r.tokenDelta, 0);

  const report: CorrectionReport = {
    ok: true,
    dryRun: opts.dryRun,
    marketId,
    question: market.question ?? marketId,
    oldWinningOptionId,
    oldWinningLabel: labelOf(oldWinningOptionId),
    newWinningOptionId,
    newWinningLabel: labelOf(newWinningOptionId),
    newResType: neu.resType,
    jackpotDelta,
    totalTokenDelta,
    affectedPlayers: playerIds.length,
    rows,
    scoreSet: opts.score ?? null,
  };

  if (opts.dryRun) {
    report.note = opts.score
      ? `Probelauf — nichts geschrieben. Ergebnis würde auf ${opts.score.home}:${opts.score.away} gesetzt (Spielplan-Tabelle).`
      : 'Probelauf — es wurde NICHTS geschrieben.';
    return report;
  }

  // ── Schreiben (ein Batch — pro Spiel unkritisch klein) ─────────────────────
  const batch = db.batch();

  for (const [pid, upd] of updatesByPlayer) {
    batch.update(db.collection('players').doc(pid), upd);
  }
  // Bet-Auszahlungen auf die neuen Werte setzen (active bleibt false → resolved).
  for (const b of allBets) {
    batch.update(db.collection('bets').doc(b.id), { payout: neu.betPayout.get(b.id) ?? 0 });
  }
  // Markt: neue Gewinner-Option + Korrektur-Marker. finalScore inkl. n.V./Elfer.
  const etFull = opts.extraTime ?? null;
  const pensFull = opts.penalties && opts.penalties.home !== opts.penalties.away ? opts.penalties : null;
  const finalScore = opts.score ? (() => {
    const fs: Record<string, any> = { home: opts.score!.home, away: opts.score!.away };
    if (etFull) { fs.extraTimeHome = etFull.home; fs.extraTimeAway = etFull.away; }
    if (pensFull) { fs.duration = 'PENALTY_SHOOTOUT'; fs.penaltiesHome = pensFull.home; fs.penaltiesAway = pensFull.away; }
    else if (etFull) { fs.duration = 'EXTRA_TIME'; }
    return fs;
  })() : undefined;
  batch.update(marketRef, {
    winningOptionId: newWinningOptionId,
    resolutionType: neu.resType,
    correctionApplied: true,
    correctionFrom: oldWinningOptionId,
    correctionTo: newWinningOptionId,
    correctedAt: FieldValue.serverTimestamp(),
    resolveInProgress: false,
    ...(finalScore ? { finalScore } : {}),
  });

  // Ergebnis im Spielplan korrigieren: die Tabelle unter „Spielplan" rechnet aus
  // dem schedule-Doc (scoreA/scoreB, status). Doc-ID = matchId (= `wc-<id>`).
  // Nur für echte WM-Spiele mit gesetztem Ergebnis.
  if (finalScore && market.marketSubtype === 'wm-match') {
    const schedDocId: string | undefined =
      (typeof market.matchId === 'string' && market.matchId) ||
      (typeof market.footballDataOrgId === 'number' ? `wc-${market.footballDataOrgId}` : undefined);
    if (schedDocId) {
      batch.set(
        db.collection('schedule').doc(schedDocId),
        // scoreCorrected: schützt das manuell korrigierte Ergebnis vor künftigen
        // API-Re-Importen (import-schedule überspringt markierte Docs).
        { scoreA: finalScore.home, scoreB: finalScore.away, status: 'finished', scoreCorrected: true },
        { merge: true },
      );
    }
  }
  // Jackpot anpassen + Logbuch.
  if (jackpotDelta !== 0) {
    batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(jackpotDelta) });
    logJackpotChange(batch, db, {
      delta: jackpotDelta,
      kind: 'manual-set',
      reason: `Auflösungs-Korrektur „${market.question ?? marketId}": ${labelOf(oldWinningOptionId)} → ${labelOf(newWinningOptionId)}`,
      marketId,
    });
  }
  // Bestehenden „Ergebnis: …"-Feed-Eintrag auf das korrigierte Resultat
  // umschreiben (sonst bleibt das falsche Ergebnis im Feed stehen). Audit-Notizen
  // (Text beginnt mit 🛠️) werden dabei NICHT angefasst.
  {
    const teamA = market.teamA ?? 'Heim';
    const teamB = market.teamB ?? 'Gast';
    const winLabel = labelOf(newWinningOptionId);
    const h = finalScore ? finalScore.home : Number((market.finalScore ?? {}).home ?? 0);
    const a = finalScore ? finalScore.away : Number((market.finalScore ?? {}).away ?? 0);
    const parts: string[] = [];
    if (etFull) parts.push(`n. V. ${etFull.home}:${etFull.away}`);
    if (pensFull) parts.push(`i. E. ${pensFull.home}:${pensFull.away}`);
    const suffix = parts.length ? ` (n. 90 Min · ${parts.join(' · ')})` : '';
    const newText = `Ergebnis: ${teamA} ${h}:${a} ${teamB}${suffix} → ${winLabel}`;
    const feedSnap = await db.collection('feed').where('marketId', '==', marketId).get();
    feedSnap.forEach(d => {
      const dd = d.data() as any;
      if (dd.type === 'market_resolved' && !String(dd.text ?? '').startsWith('🛠️')) {
        batch.update(d.ref, { text: newText });
      }
    });
  }
  // Audit-Notiz (transparent, erklärt die Token-/Streak-Änderung).
  batch.set(db.collection('feed').doc(), {
    type: 'market_resolved',
    marketId,
    text: `🛠️ Korrektur: ${market.question ?? marketId} → ${labelOf(newWinningOptionId)} (vorher ${labelOf(oldWinningOptionId)}). Token- & Streak-Stände angepasst.`,
    ts: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  report.note = `Korrektur angewandt: ${playerIds.length} Spieler, Token-Summe ${totalTokenDelta >= 0 ? '+' : ''}${totalTokenDelta}, Jackpot ${jackpotDelta >= 0 ? '+' : ''}${jackpotDelta}`
    + (finalScore && market.marketSubtype === 'wm-match' ? `, Ergebnis ${finalScore.home}:${finalScore.away} (Spielplan).` : '.');
  return report;
}
