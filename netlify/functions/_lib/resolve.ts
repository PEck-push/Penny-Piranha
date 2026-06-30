import { getDb, FieldValue } from './firebaseAdmin';
import { logJackpotChange } from './jackpotLedger';

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

// Spieltag-Schlüssel = Anpfiff-Datum am AMERIKANISCHEN Tag (YYYY-MM-DD). Die WM
// 2026 wird in USA/Kanada/Mexiko gespielt; ein Spieltag entspricht dem dortigen
// Kalendertag. Anker = US-Pazifik (America/Los_Angeles), die westlichste Venue-
// Zone — so bleibt selbst das späteste Westküsten-Abendspiel am selben Tagesdatum
// (in Europa fällt so ein Spiel oft schon auf den Folgetag). Spielfreie Tage
// erzeugen nie einen neuen Key. Dient nur als stabile Kennung eines Spieltags.
function americanMatchdayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
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
  shootoutWinner?: 'home' | 'away' | null; // zuverlässiger Sieger (score.winner)
  teamA: string;
  teamB: string;
}

// Headline für den Feed. Wir lösen Märkte nach dem 90-Min-Stand auf
// (Wettbüro-1X2-Standard), daher zeigen wir IMMER `home:away` als 90-Min-Stand.
// Bei Verlängerung/Elfern hängen wir den Verlauf transparent dran, damit klar
// ist: die Wette ist nach 90 Min entschieden, das Spiel ging aber weiter.
function formatScoreLine(s: ResolveScore): string {
  const base = `${s.teamA} ${s.home}:${s.away} ${s.teamB}`;
  if (s.duration === 'PENALTY_SHOOTOUT') {
    // Nur eine GÜLTIGE Elfer-Bilanz anzeigen (entschieden, ≠ unentschieden) —
    // football-data liefert hier teils den Stand vor dem Schießen (z. B. 3:3).
    // Sonst den zuverlässigen Sieger (score.winner) per Name nennen.
    const validPens = s.penaltiesHome != null && s.penaltiesAway != null && s.penaltiesHome !== s.penaltiesAway;
    if (validPens) return `${base} (n. 90 Min · i. E. ${s.penaltiesHome}:${s.penaltiesAway})`;
    const who = s.shootoutWinner === 'home' ? s.teamA : s.shootoutWinner === 'away' ? s.teamB : null;
    return who ? `${base} (n. 90 Min · i. E. für ${who})` : `${base} (n. 90 Min · i. E. entschieden)`;
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
    // active:false → Markt ist ausgewertet, Tipp fällt aus dem (künftig
    // eingegrenzten) Live-Listener heraus.
    batch.update(db.collection('bets').doc(betId), { payout, active: false });
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

// Optionaler winningOptionIds-Parameter fuer Multi-Winner (Spezialwetten /
// Jackpot-Runden mit allowMultiWinner=true). Wenn gesetzt, werden ALLE darin
// enthaltenen Optionen als korrekt gewertet und ihre Tipper teilen sich den
// Preis. winningOptionId bleibt der "primaere" Wert (erster Eintrag der Liste
// bzw. der einzige bei klassischer Single-Winner-Aufloesung).
export async function resolveMarketAdmin(
  marketId: string,
  winningOptionId: string,
  by: 'auto' | 'admin' = 'auto',
  score?: ResolveScore,
  winningOptionIds?: string[],
): Promise<{ ok: boolean; skipped?: boolean; payouts?: Record<string, number> }> {
  const db = getDb();
  const marketRef = db.collection('markets').doc(marketId);
  const appRef = db.collection('appState').doc('global');

  const market = await claimMarket(marketRef);
  if (!market) return { ok: true, skipped: true };

  // Internes Gewinner-Set: bei explizitem Multi-Array dessen Inhalt, sonst
  // nur die eine primaere Option.
  const winningSet: string[] = Array.isArray(winningOptionIds) && winningOptionIds.length > 0
    ? winningOptionIds.filter(Boolean)
    : (winningOptionId ? [winningOptionId] : []);
  const isMultiWinner = winningSet.length > 1;

  try {
    // ── Spieltag-Wechsel: Spieltag-Bilanz (matchdayNetGain, Tagessieger-Orden)
    // nur an Tagen mit echten Spielen zurücksetzen — NICHT an spielfreien Tagen.
    // Schlüssel = Anpfiff-Datum am amerikanischen Tag des aufgelösten WM-Spiels.
    // Beim ersten Spiel eines neuen Spieltags wird per CAS-Transaction die
    // Spieltag-Bilanz aller Spieler genullt, bevor die Ergebnisse dieses Spiel-
    // tags verbucht werden. So bleiben alle Spiele eines US-Kalendertags in der-
    // selben Tageswertung, und zwischen den Spieltagen bleibt der letzte Spiel-
    // tagssieger gekrönt. dailyNetGain (Reveal-Bilanz) bleibt hier unberührt.
    if (market.marketSubtype === 'wm-match' && typeof market.kickoffAt === 'number') {
      const matchdayKey = americanMatchdayKey(market.kickoffAt);
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
          // Spieltag-Wechsel: nur matchdayNetGain nullen. Das Underdog-Badge
          // läuft jetzt zeitbasiert (24 h ab Sieg) und wird hier NICHT entfernt.
          // dailyNetGain gehört dem Reveal-Screen und bleibt ebenfalls unberührt.
          rb.update(d.ref, { matchdayNetGain: 0 });
          if (++rn >= 400) { await rb.commit(); rb = db.batch(); rn = 0; }
        }
        if (rn > 0) await rb.commit();
      }
    }

    const appSnap = await appRef.get();

    const betsSnap = await db.collection('bets').where('marketId', '==', marketId).get();
    const allBets: BetDoc[] = betsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    // Multi-Winner: ein Bet gilt als korrekt, wenn seine optionId in der
    // Gewinner-Menge enthalten ist. Klassisch (Single-Winner) ist die Menge
    // nur ein Element — Verhalten identisch zu vorher.
    const winBets = allBets.filter(b => winningSet.includes(b.optionId));

    // ── Jackpot-Sonderrunde (einsatzfrei, fester Haus-Preis) ──────────────────
    // Korrekte Tipper teilen den festen Preis gleichmäßig. Die Finale-Headline
    // absorbiert zusätzlich den angesparten jackpot. Kein Streak/Underdog hier.
    if (market.marketSubtype === 'jackpot') {
      const currentJackpot = Number((appSnap.data() as any)?.jackpot ?? 0);
      const fixedPrize = Number(market.fixedPrize ?? 0);
      const prize = fixedPrize + (market.absorbsJackpotPot ? currentJackpot : 0);
      // Ausgeschiedene Spieler (auf 0, kein Rückkauf) bekommen KEINE Jackpot-/
      // Gratis-Auszahlung mehr. Ihre Gewinner-Tipps werden wie Verlierer mit
      // payout 0 markiert und zählen nicht beim gleichmäßigen Teilen mit.
      const jpWinnerIds = [...new Set(winBets.map(b => String(b.playerId)))];
      const jpSnaps = await Promise.all(jpWinnerIds.map(id => db.collection('players').doc(id).get()));
      const jpEliminated = new Set(jpSnaps.filter(s => (s.data() as any)?.eliminated === true).map(s => s.id));
      const eligibleWinBets = winBets.filter(b => !jpEliminated.has(String(b.playerId)));
      const n = eligibleWinBets.length;
      // Garantierter Mindestgewinn pro Gewinner (harte Untergrenze, NICHT addiert):
      // jeder bekommt max(gleichmäßiger Anteil, minPerWinner). Wenn die Garantie
      // greift (Anteil < min), übersteigt die Summe den Pot — die Differenz deckt
      // das Haus (jackpot sinkt entsprechend über fixedPrize − paid unten).
      const minPerWinner = Math.max(0, Number(market.minPrizePerWinner ?? 0));
      const each = n > 0 ? Math.max(Math.floor(prize / n), minPerWinner) : 0;
      const paid = each * n;

      const batch = db.batch();
      batch.update(marketRef, {
        status: 'resolved',
        winningOptionId,
        // Multi-Winner: alle als korrekt markierten Optionen festhalten,
        // damit die Anzeige sie nachher kennt (Reveal, Rangliste-Details).
        ...(isMultiWinner ? { winningOptionIds: winningSet } : {}),
        resolutionType: 'normal',
        resolvedBy: by,
        resolvedAt: FieldValue.serverTimestamp(),
        resolveInProgress: false,
      });
      const payouts: Record<string, number> = {};
      const betPayouts = new Map<string, number>();
      for (const b of eligibleWinBets) {
        payouts[b.playerId] = (payouts[b.playerId] ?? 0) + each;
        betPayouts.set(b.id, each);
        batch.update(db.collection('players').doc(String(b.playerId)), {
          tokens: FieldValue.increment(each),
          dailyNetGain: FieldValue.increment(each),
          matchdayNetGain: FieldValue.increment(each),
          unseenResolutions: FieldValue.arrayUnion(marketId),
        });
      }
      // Verlierer- UND ausgeschiedene Gewinner-Bets als „ohne Auszahlung" (0) markieren.
      for (const b of allBets) if (!betPayouts.has(b.id)) betPayouts.set(b.id, 0);
      persistBetPayouts(batch, betPayouts);
      // Delta = fixedPrize − paid (gilt für beide Fälle): nicht ausgezahlter Rest
      // des Festpreises rollt in den jackpot. Beim Absorbieren wird der angesparte
      // Pot Teil von `prize` und damit ausgeschüttet — der Saldo bleibt fixedPrize−paid.
      batch.update(appRef, { jackpot: FieldValue.increment(fixedPrize - paid) });
      logJackpotChange(batch, db, {
        delta: fixedPrize - paid,
        kind: market.absorbsJackpotPot ? 'finale-absorb' : 'jackpot-round',
        reason: market.absorbsJackpotPot
          ? `Finale schüttet Jackpot aus: ${market.question ?? marketId}`
          : `Gratis-/Jackpot-Runde Rest: ${market.question ?? marketId}`,
        marketId,
      });
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
            matchdayNetGain: FieldValue.increment(payout - (b.amount || 0)),
            unseenResolutions: FieldValue.arrayUnion(marketId),
          });
        } else {
          // Einsatz wurde beim Tippen bereits abgezogen → nur Tagesbilanz/Reveal.
          betPayouts.set(b.id, 0);
          batch.update(playerRef, {
            dailyNetGain: FieldValue.increment(-(b.amount || 0)),
            matchdayNetGain: FieldValue.increment(-(b.amount || 0)),
            unseenResolutions: FieldValue.arrayUnion(marketId),
          });
        }
      }
      persistBetPayouts(batch, betPayouts);
      // Jackpot soll NUR wachsen: Gewinn-Mehrbetrag deckt das Haus (kein Abzug
      // aus dem Jackpot). Verlorene Einsätze fließen weiterhin in den Jackpot.
      const jackpotDelta = won ? 0 : totalPool;
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
      // delta 0 (Gewinn) wird vom Logger übersprungen; nur der Verlust-Zufluss wird geloggt.
      logJackpotChange(batch, db, {
        delta: jackpotDelta,
        kind: 'combo',
        reason: `Combo gescheitert (Einsätze in den Jackpot): ${market.question ?? marketId}`,
        marketId,
      });
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
    // poolDelta = was aus Einsätzen/Rundung in den Topf fließt (+). Boni (Underdog/
    // Streak) belasten den Jackpot NICHT mehr — sie werden vom Haus gedeckt, damit
    // der Jackpot nur wächst und allein das Finale ihn ausschüttet.
    let poolDelta = 0;
    let resType: 'normal' | 'no-winner' | 'all-same-side' = 'normal';

    if (market.multiSelect) {
      // Exact-match: nur Tipps mit identischer Auswahl (kanonischer Key) gewinnen und
      // teilen den Gesamteinsatz anteilig. Kein Underdog (keine Pro-Option-Pools).
      const totalStake = allBets.reduce((s, b) => s + (b.amount || 0), 0);
      const winStake = winBets.reduce((s, b) => s + (b.amount || 0), 0);
      if (winStake === 0) {
        resType = 'no-winner';
        jackpotDelta += totalStake;
        poolDelta += totalStake;
      } else {
        let paid = 0;
        for (const b of winBets) {
          const payout = Math.max(round((b.amount / winStake) * totalStake), b.amount + MIN_WIN_BONUS);
          payouts[b.playerId] = (payouts[b.playerId] ?? 0) + payout;
          betPayouts.set(b.id, payout);
          paid += payout;
        }
        jackpotDelta += totalStake - paid;
        poolDelta += totalStake - paid;
      }
    } else if (winPool === 0) {
      // Kein Gewinner → ganzer Einsatz-Pool UND der Seed (Auto-Abzug-Strafen)
      // in den Jackpot (Fallback: keine Gewinner dieser Partie vorhanden).
      resType = 'no-winner';
      jackpotDelta += totalPool + seed;
      poolDelta += totalPool + seed;
    } else if (winPool === totalPool && seed <= 0) {
      // Alle auf derselben Seite (ohne Seed): reine Einsatz-Rückzahlung, Jackpot
      // unangetastet. MIT Seed läuft es über den Normal-Zweig, damit der Seed
      // (Auto-Abzug-Strafen) an die – hier alle – Gewinner verteilt wird.
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
          // Underdog-Bonus wird vom Haus gedeckt — kein Abzug aus dem Jackpot.
        }
      }
      jackpotDelta += effectivePool - paid; // rounding remainder → jackpot
      poolDelta += effectivePool - paid;
    }
    // Verlierer-Bets als 0 markieren (für Anzeige im Verlauf).
    for (const b of allBets) if (!betPayouts.has(b.id)) betPayouts.set(b.id, 0);

    const batch = db.batch();
    const validPens = score?.penaltiesHome != null && score?.penaltiesAway != null && score.penaltiesHome !== score.penaltiesAway;
    const finalScorePersist = score ? {
      home: score.home,
      away: score.away,
      ...(score.duration ? { duration: score.duration } : {}),
      // Nur eine gültige (entschiedene) Elfer-Bilanz speichern.
      ...(validPens ? { penaltiesHome: score.penaltiesHome, penaltiesAway: score.penaltiesAway } : {}),
      ...(score.shootoutWinner ? { shootoutWinner: score.shootoutWinner } : {}),
    } : null;
    batch.update(marketRef, {
      status: 'resolved',
      winningOptionId,
      // Multi-Winner: zusaetzlich das volle Set persistieren.
      ...(isMultiWinner ? { winningOptionIds: winningSet } : {}),
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

    // Streak/Underdog werden NUR bei einer „echten" Auflösung (resType === 'normal')
    // angewandt. Bei all-same-side (reine Rückzahlung) oder no-winner (niemand
    // richtig) gibt es keinen Streak-Tick und keinen Underdog-Bonus — der Streak
    // bleibt unverändert, kein Milestone-Bonus wird ausgeschüttet.
    const isRealResult = resType === 'normal';
    for (const ps of playerSnaps) {
      if (!ps.exists) continue;
      const p = ps.data() as any;
      const myBet = allBets.find(b => b.playerId === ps.id);
      const correct = !!myBet && winningSet.includes(myBet.optionId);
      const basePayout = payouts[ps.id] ?? 0;

      const upd: Record<string, any> = {
        tokens: FieldValue.increment(basePayout),
        unseenResolutions: FieldValue.arrayUnion(marketId),
        dailyNetGain: FieldValue.increment(basePayout - (myBet?.amount ?? 0)),
        matchdayNetGain: FieldValue.increment(basePayout - (myBet?.amount ?? 0)),
      };

      if (isRealResult) {
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
          upd.tokens = FieldValue.increment(basePayout + streakBonus);
          // Streak-Bonus wird vom Haus gedeckt — kein Abzug aus dem Jackpot.
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

        upd.currentStreak = newStreak;
        upd.streakLevel = level;
        upd.bestStreak = Math.max(p.bestStreak ?? 0, newStreak);
        if (correct && isUnderdog) {
          upd.underdogCorrect = FieldValue.increment(1);
          // Underdog-Badge: Zeitstempel setzen → wird 24 h lang angezeigt.
          upd.underdogBadgeAt = Date.now();
        }

        // Accessoires automatisch freischalten (rein kosmetisch, nicht auto-getragen).
        const accessoryAdds: string[] = [];
        if (correct && newStreak === 4) accessoryAdds.push('flames');        // Kopf: Flammen
        // Underdog: KEIN dauerhaftes Accessoire mehr — nur das 24-h-Auto-Badge
        // (underdogBadgeAt, oben gesetzt).

        const allOverlayAdds = [...overlayAdds, ...accessoryAdds];
        if (allOverlayAdds.length > 0) upd.unlockedOverlays = FieldValue.arrayUnion(...allOverlayAdds);
        // Badge dynamisch nach AKTUELLEM Streak setzen: on_fire (4–6), damn_hot
        // (7+) oder weg (level 'none' → bei falschem Tipp / Streak < 4). So ist
        // man nur on_fire bis damn_hot ODER bis zum nächsten falschen Tipp.
        upd.activeBadgeId = level === 'none' ? null : level;
      }

      batch.update(ps.ref, upd);
    }

    batch.update(appRef, { jackpot: FieldValue.increment(jackpotDelta) });
    // Jackpot-Logbuch: nur noch der Pool-Zufluss (Einsätze/Rundung) — Boni
    // belasten den Jackpot nicht mehr. jackpotDelta === poolDelta. 0 wird übersprungen.
    const mLabel = market.question ?? marketId;
    logJackpotChange(batch, db, {
      delta: poolDelta,
      kind: resType === 'no-winner' ? 'no-winner' : 'resolve-pool',
      reason: resType === 'no-winner'
        ? `Kein Gewinner – Einsätze in den Jackpot: ${mLabel}`
        : `Auswertung – Pool-Rest/Rundung: ${mLabel}`,
      marketId,
    });
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

    // ── Combo-Legs nachziehen ─────────────────────────────────────────────────
    // Abhängige Combo-Märkte (offen oder gesperrt) bekommen das Leg-Resultat
    // dieses Markts und werden automatisch aufgelöst, wenn entweder ein Miss
    // vorliegt (sofort verloren) oder alle Legs als Hit feststehen (gewonnen).
    // Wichtig: Diese Logik lebte bisher nur client-seitig (`store.resolveMarket`)
    // und blieb nach der Server-Migration auf der Strecke.
    try {
      const combosSnap = await db.collection('markets').where('type', '==', 'combo').get();
      for (const cd of combosSnap.docs) {
        const combo = cd.data() as any;
        if (combo.status !== 'open' && combo.status !== 'locked') continue;
        const legs: any[] = Array.isArray(combo.comboLegs) ? combo.comboLegs : [];
        if (!legs.some(l => l.marketId === marketId)) continue;
        const updatedLegs = legs.map(leg =>
          leg.marketId === marketId
            ? { ...leg, status: leg.predictedOptionId === winningOptionId ? 'hit' : 'miss' }
            : leg
        );
        await cd.ref.update({ comboLegs: updatedLegs });
        const anyMiss = updatedLegs.some(l => l.status === 'miss');
        const allHit = updatedLegs.every(l => l.status === 'hit');
        if (anyMiss) {
          await resolveMarketAdmin(cd.id, 'combo-miss', by);
        } else if (allHit) {
          await resolveMarketAdmin(cd.id, 'combo-win', by);
        }
      }
    } catch (err) {
      console.error('[resolve] Combo-Legs nachziehen Fehler:', err);
    }

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
      batch.update(d.ref, { payout: r, active: false });
    });
    batch.update(marketRef, {
      status: 'resolved', winningOptionId: null, resolutionType: 'rollover',
      resolvedBy: by, resolvedAt: FieldValue.serverTimestamp(), resolveInProgress: false,
    });
    batch.update(db.collection('appState').doc('global'), { jackpot: FieldValue.increment(totalPool - refunded) });
    logJackpotChange(batch, db, {
      delta: totalPool - refunded,
      kind: 'rollover',
      reason: `Rollover (50% zurück, Rest in den Jackpot): ${market.question ?? marketId}`,
      marketId,
    });
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
      batch.update(d.ref, { payout: b.amount || 0, active: false });
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
