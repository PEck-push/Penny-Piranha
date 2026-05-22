/**
 * lockMarkets — Cloud Scheduler, runs every minute ("* * * * *").
 *
 * For every market with status='open' and kickoffAt <= now():
 *   1. Snapshot the pool (lockedPoolSnapshot)
 *   2. Set status = 'locked'
 *   3. Process auto-deductions for players who didn't bet
 *   4. Write audit trail to autoDeductions collection
 */

import * as admin from 'firebase-admin';
import { roundCredits } from './types';

const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;

export async function lockMarketsJob(): Promise<void> {
  const firestore = db();
  const now = Date.now();

  const openMarkets = await firestore
    .collection('markets')
    .where('status', '==', 'open')
    .where('kickoffAt', '<=', now)
    .get();

  if (openMarkets.empty) return;

  const playersSnap = await firestore.collection('players').get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  for (const marketDoc of openMarkets.docs) {
    const market = marketDoc.data();

    // Skip if auto-deduct already processed (idempotency guard)
    if (market.autoDeductProcessed) continue;

    // ── Build locked pool snapshot ────────────────────────────────────────
    const lockedPoolSnapshot: Record<string, number> = {};
    (market.options ?? []).forEach((opt: any) => {
      lockedPoolSnapshot[opt.id] = opt.pool ?? 0;
    });

    // ── Find bettors who already placed bets ─────────────────────────────
    const betsSnap = await firestore
      .collection('bets')
      .where('marketId', '==', marketDoc.id)
      .get();
    const bettorIds = new Set(betsSnap.docs.map(d => (d.data() as any).playerId as string));

    // ── Process auto-deductions ───────────────────────────────────────────
    const autoDeduct: number = market.autoDeductAmount ?? 10;
    const batch = firestore.batch();
    let hausbankGain = 0;

    for (const player of players) {
      if (bettorIds.has(player.id)) continue; // already bet — no deduction
      if ((player.tokens ?? 0) <= 0) continue; // broke players skip

      const deductAmount = Math.min(player.tokens ?? 0, autoDeduct);
      if (deductAmount <= 0) continue;

      // Deduct tokens
      batch.update(firestore.collection('players').doc(player.id), {
        tokens: FieldValue.increment(-deductAmount),
      });
      hausbankGain += deductAmount;

      // Audit trail
      const auditRef = firestore.collection('autoDeductions').doc();
      batch.set(auditRef, {
        playerId: player.id,
        marketId: marketDoc.id,
        amount: deductAmount,
        tokensAfter: (player.tokens ?? 0) - deductAmount,
        ts: FieldValue.serverTimestamp(),
      });
    }

    // ── Update market ─────────────────────────────────────────────────────
    batch.update(marketDoc.ref, {
      status: 'locked',
      lockedPoolSnapshot,
      autoDeductProcessed: true,
      lockedAt: FieldValue.serverTimestamp(),
    });

    // ── Update hausbank ───────────────────────────────────────────────────
    if (hausbankGain > 0) {
      batch.update(firestore.collection('appState').doc('global'), {
        hausbank: FieldValue.increment(hausbankGain),
      });
    }

    // ── Feed entry ────────────────────────────────────────────────────────
    const feedRef = firestore.collection('feed').doc();
    batch.set(feedRef, {
      type: 'market_locked',
      marketId: marketDoc.id,
      text: `🔒 Markt gesperrt: ${market.question ?? marketDoc.id}`,
      ts: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`[lockMarkets] Locked market ${marketDoc.id}, deducted from ${players.length - bettorIds.size} players`);
  }
}
