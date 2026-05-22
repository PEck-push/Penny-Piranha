/**
 * Firebase Cloud Functions — Penny Piranha WM 2026
 *
 * Deploy:
 *   cd functions && npm install && npm run build
 *   firebase deploy --only functions
 *
 * Required env config (firebase functions:config:set):
 *   football_data.api_key  — football-data.org v4 API key
 *   whatsapp.token         — Meta WhatsApp Business Cloud API token
 *   whatsapp.phone_id      — WhatsApp Business Phone Number ID
 *   whatsapp.group_id      — WhatsApp Group Chat ID
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { lockMarketsJob } from './lockMarkets';
import { autoResolveMatchesJob } from './autoResolve';
import { resolveMarket } from './resolveMarket';
import { awardDailyBadges } from './badges';
import { sendDailyPreview, sendDailySummary } from './whatsapp';

admin.initializeApp();

// ── Scheduled: Lock markets every minute ─────────────────────────────────────
export const lockMarkets = functions
  .region('europe-west1')
  .pubsub.schedule('* * * * *')
  .timeZone('Europe/Vienna')
  .onRun(async () => {
    await lockMarketsJob();
  });

// ── Scheduled: Auto-resolve finished WM matches every 5 minutes ──────────────
export const autoResolveMatches = functions
  .region('europe-west1')
  .pubsub.schedule('*/5 * * * *')
  .timeZone('Europe/Vienna')
  .onRun(async () => {
    await autoResolveMatchesJob();
  });

// ── Scheduled: Daily badges + reset dailyNetGain (00:30 CEST) ────────────────
export const dailyBadgesReset = functions
  .region('europe-west1')
  .pubsub.schedule('30 22 * * *') // 22:30 UTC = 00:30 CEST
  .timeZone('Europe/Vienna')
  .onRun(async () => {
    await awardDailyBadges();
  });

// ── Scheduled: Morning preview (10:00 CEST = 08:00 UTC) ──────────────────────
export const whatsAppDailyPreview = functions
  .region('europe-west1')
  .pubsub.schedule('0 8 * * *')
  .timeZone('Europe/Vienna')
  .onRun(async () => {
    await sendDailyPreview();
  });

// ── Scheduled: Morning summary (09:00 CEST = 07:00 UTC) ──────────────────────
export const whatsAppDailySummary = functions
  .region('europe-west1')
  .pubsub.schedule('0 7 * * *')
  .timeZone('Europe/Vienna')
  .onRun(async () => {
    await sendDailySummary();
  });

// ── Callable: Manual market resolution (from Admin panel) ─────────────────────
export const resolveMarketCallable = functions
  .region('europe-west1')
  .https.onCall(async (data: { marketId: string; winningOptionId: string }, context) => {
    // Require Firebase Auth (only logged-in users can call — further
    // authorization can be added via custom claims if needed)
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

    const { marketId, winningOptionId } = data;
    if (!marketId || !winningOptionId) {
      throw new functions.https.HttpsError('invalid-argument', 'marketId and winningOptionId required');
    }

    try {
      const result = await resolveMarket(marketId, winningOptionId, 'admin');
      return result;
    } catch (err: any) {
      throw new functions.https.HttpsError('internal', err.message);
    }
  });
