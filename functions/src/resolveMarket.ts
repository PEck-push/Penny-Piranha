/**
 * resolveMarket — shared resolution logic called by:
 *   - Admin manual resolution (callable function)
 *   - autoResolveMatches (scheduled function, via football-data.org)
 *
 * Implements:
 *   - Parimutuel payout with roundCredits()
 *   - Minimum win bonus: payout >= stake + MIN_WIN_BONUS
 *   - Underdog bonus: +10% from hausbank if winning option had < 15% of locked pool
 *   - No-winner case: 100% of pool -> hausbank (not 50%)
 *   - Streak updates + badge checks for all bettors
 *   - unseenResolutions population for result reveal
 *   - Feed entry creation
 */

import * as admin from 'firebase-admin';
import { roundCredits, MIN_WIN_BONUS, UNDERDOG_THRESHOLD, UNDERDOG_BONUS } from './types';
import { checkAndAwardBadges } from './badges';

const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;

export interface ResolutionResult {
  resolvedMarketId: string;
  winningOptionId: string;
  payouts: Record<string, number>; // playerId -> credits awarded
  hausbankDelta: number;           // positive = money into hausbank, negative = money out
}

export async function resolveMarket(
  marketId: string,
  winningOptionId: string,
  resolvedBy: 'auto' | 'admin' = 'admin',
): Promise<ResolutionResult> {
  const firestore = db();

  return await firestore.runTransaction(async tx => {
    const marketRef  = firestore.collection('markets').doc(marketId);
    const appStateRef = firestore.collection('appState').doc('global');

    const [marketSnap, appSnap] = await Promise.all([
      tx.get(marketRef),
      tx.get(appStateRef),
    ]);

    if (!marketSnap.exists) throw new Error(`Market ${marketId} not found`);
    const market = marketSnap.data()!;
    if (market.status === 'resolved' || market.status === 'cancelled') {
      throw new Error(`Market ${marketId} already finalized`);
    }

    const hausbank: number = appSnap.data()?.hausbank ?? 0;
    let hausbankDelta = 0;

    // ── Load all bets ────────────────────────────────────────────────────────
    const betsSnap = await tx.get(firestore.collection('bets').where('marketId', '==', marketId));
    const allBets = betsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const winBets = allBets.filter((b: any) => b.optionId === winningOptionId);

    const betPool = allBets.reduce((s: number, b: any) => s + b.stake, 0);
    const winPool = winBets.reduce((s: number, b: any) => s + b.stake, 0);
    const seedCredits: number = market.initialSeedCredits ?? 0;
    const effectivePool = betPool + seedCredits;

    const payouts: Record<string, number> = {};

    if (winPool === 0) {
      // No winner: 100% of pool -> hausbank, seedCredits forfeit
      hausbankDelta += betPool;
    } else {
      // Normal parimutuel
      const totalWinnerStake = winPool;
      let totalPaid = 0;

      for (const bet of winBets) {
        const rawPayout = (bet.stake / totalWinnerStake) * effectivePool;
        const payout = Math.max(roundCredits(rawPayout), bet.stake + MIN_WIN_BONUS);
        payouts[bet.playerId] = (payouts[bet.playerId] ?? 0) + payout;
        totalPaid += payout;
      }

      // Underdog check against lockedPoolSnapshot
      const lockedSnapshot: Record<string, number> = market.lockedPoolSnapshot ?? {};
      const lockedTotal = Object.values(lockedSnapshot).reduce((s, v) => s + v, 0);
      const lockedWinPool = lockedSnapshot[winningOptionId] ?? winPool;
      if (lockedTotal > 0 && lockedWinPool / lockedTotal < UNDERDOG_THRESHOLD) {
        // Extra 10% bonus from hausbank for each winner
        for (const bet of winBets) {
          const bonus = roundCredits(bet.stake * UNDERDOG_BONUS);
          payouts[bet.playerId] = (payouts[bet.playerId] ?? 0) + bonus;
          hausbankDelta -= bonus; // hausbank pays the bonus
        }
        // Create underdogCorrect increment for each winner
        for (const bet of winBets) {
          const playerRef = firestore.collection('players').doc(bet.playerId);
          tx.update(playerRef, { underdogCorrect: FieldValue.increment(1) });
        }
      }

      // Rounding remainder -> hausbank
      const roundingRemainder = effectivePool - totalPaid;
      if (roundingRemainder > 0) hausbankDelta += roundingRemainder;
    }

    // ── Update market ────────────────────────────────────────────────────────
    tx.update(marketRef, {
      status: 'resolved',
      winningOptionId,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy,
      autoResolved: resolvedBy === 'auto',
    });

    // ── Update player tokens + streak + unseenResolutions ────────────────────
    const allBettorIds = [...new Set<string>(allBets.map((b: any) => String(b.playerId)))];
    const playerSnaps = await Promise.all(
      allBettorIds.map(pid => tx.get(firestore.collection('players').doc(pid))),
    );

    for (const playerSnap of playerSnaps) {
      if (!playerSnap.exists) continue;
      const player = playerSnap.data()!;
      const playerId = playerSnap.id;
      const payout = payouts[playerId] ?? 0;
      const myBet = allBets.find((b: any) => b.playerId === playerId);
      const isCorrect = myBet?.optionId === winningOptionId;

      let newStreak = isCorrect ? (player.currentStreak ?? 0) + 1 : 0;
      let streakLevel: string = 'none';
      if (newStreak >= 7) streakLevel = 'damn_hot';
      else if (newStreak >= 4) streakLevel = 'on_fire';

      const update: Record<string, any> = {
        tokens: FieldValue.increment(payout),
        currentStreak: newStreak,
        streakLevel,
        bestStreak: Math.max(player.bestStreak ?? 0, newStreak),
        unseenResolutions: FieldValue.arrayUnion(marketId),
        dailyNetGain: FieldValue.increment(payout - (myBet?.stake ?? 0)),
      };

      if (payout > 0) {
        update.betHistory = FieldValue.arrayUnion({
          marketId,
          stake: myBet?.stake ?? 0,
          payout,
          correct: isCorrect,
          ts: Date.now(),
        });
      }

      tx.update(playerSnap.ref, update);
    }

    // ── Update hausbank ───────────────────────────────────────────────────────
    tx.update(appStateRef, {
      hausbank: FieldValue.increment(hausbankDelta),
    });

    // ── Feed entry ────────────────────────────────────────────────────────────
    const feedRef = firestore.collection('feed').doc();
    tx.set(feedRef, {
      type: 'market_resolved',
      marketId,
      text: `Markt aufgelöst: ${market.question ?? marketId} → ${winningOptionId}`,
      ts: FieldValue.serverTimestamp(),
    });

    // ── Async badge checks (after transaction) ─────────────────────────────
    // Scheduled for post-commit since they need fresh player data
    setImmediate(async () => {
      for (const pid of allBettorIds) {
        await checkAndAwardBadges(pid).catch(console.error);
      }
    });

    return { resolvedMarketId: marketId, winningOptionId, payouts, hausbankDelta };
  });
}
