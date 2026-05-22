/**
 * WhatsApp Business Cloud API integration.
 *
 * Two daily messages (Vienna time / CEST = UTC+2):
 *   - 10:00 CEST: Today's matches preview
 *   - 09:00 CEST next day: Yesterday's summary
 *
 * Required env vars (firebase functions:config:set):
 *   whatsapp.token      — Meta WhatsApp Business Cloud API token
 *   whatsapp.phone_id   — WhatsApp Business Phone Number ID
 *   whatsapp.group_id   — WhatsApp Group Chat ID to message
 *
 * Deploy with:
 *   firebase functions:config:set whatsapp.token="..." whatsapp.phone_id="..." whatsapp.group_id="..."
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as https from 'https';

const db = () => admin.firestore();

function postJson(url: string, token: string, body: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) reject(new Error(`WhatsApp API ${res.statusCode}`));
        else resolve();
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendWhatsApp(token: string, phoneId: string, to: string, text: string): Promise<void> {
  await postJson(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    token,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    },
  );
}

// ── Format UTC timestamp as CEST ────────────────────────────────────────────
function toCEST(ts: number): string {
  const d = new Date(ts + 2 * 60 * 60 * 1000);
  const h   = d.getUTCHours().toString().padStart(2, '0');
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const mon = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}.${mon}. ${h}:${min}`;
}

// ── Morning Preview (10:00 CEST) ─────────────────────────────────────────────
export async function sendDailyPreview(): Promise<void> {
  const cfg = functions.config();
  const token   = cfg.whatsapp?.token;
  const phoneId = cfg.whatsapp?.phone_id;
  const groupId = cfg.whatsapp?.group_id;
  if (!token || !phoneId || !groupId) {
    console.warn('[WhatsApp] Config missing — skipping preview');
    return;
  }

  const firestore = db();
  const now = Date.now();
  const endOfDay = now + 24 * 60 * 60 * 1000;

  // Markets opening today
  const marketsSnap = await firestore
    .collection('markets')
    .where('kickoffAt', '>=', now)
    .where('kickoffAt', '<=', endOfDay)
    .where('marketSubtype', '==', 'wm-match')
    .orderBy('kickoffAt')
    .get();

  if (marketsSnap.empty) {
    console.log('[WhatsApp] No matches today — skipping preview');
    return;
  }

  const lines = ['⚽ *WM 2026 — Heutige Spiele*\n'];
  for (const doc of marketsSnap.docs) {
    const m = doc.data();
    lines.push(`🕐 ${toCEST(m.kickoffAt as number)} — *${m.teamA}* vs *${m.teamB}*`);
  }
  lines.push('\n🎯 Tipps jetzt abgeben: https://pennypiranha.app');

  await sendWhatsApp(token, phoneId, groupId, lines.join('\n'));
  console.log('[WhatsApp] Daily preview sent');
}

// ── Morning Summary (09:00 CEST) ─────────────────────────────────────────────
export async function sendDailySummary(): Promise<void> {
  const cfg = functions.config();
  const token   = cfg.whatsapp?.token;
  const phoneId = cfg.whatsapp?.phone_id;
  const groupId = cfg.whatsapp?.group_id;
  if (!token || !phoneId || !groupId) {
    console.warn('[WhatsApp] Config missing — skipping summary');
    return;
  }

  const firestore = db();

  // Players sorted by tokens
  const playersSnap = await firestore.collection('players').orderBy('tokens', 'desc').limit(20).get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  if (players.length === 0) return;

  const leader = players[0];

  // Spieltagskönig / Arschkarte via dailyNetGain
  const allPlayers = await firestore.collection('players').get();
  const all = allPlayers.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const sortedByGain = [...all].sort((a, b) => (b.dailyNetGain ?? 0) - (a.dailyNetGain ?? 0));
  const dayKing  = sortedByGain[0];
  const dayLoser = sortedByGain[sortedByGain.length - 1];

  // Active streaks
  const streakPlayers = all.filter(p => (p.currentStreak ?? 0) >= 3);

  const lines = ['📊 *WM 2026 — Gestern im Überblick*\n'];
  lines.push(`👑 *Tabellenführer:* ${leader.displayName ?? leader.name} (${leader.tokens} Cr.)`);

  if (dayKing && (dayKing.dailyNetGain ?? 0) > 0) {
    lines.push(`🏆 *Spieltagskönig:* ${dayKing.displayName ?? dayKing.name} (+${dayKing.dailyNetGain} Cr.)`);
  }
  if (dayLoser && (dayLoser.dailyNetGain ?? 0) < 0) {
    lines.push(`🃏 *Arschkarte:* ${dayLoser.displayName ?? dayLoser.name} (${dayLoser.dailyNetGain} Cr.)`);
  }

  if (streakPlayers.length > 0) {
    lines.push('\n🔥 *Aktive Streaks:*');
    for (const p of streakPlayers) {
      const emoji = p.streakLevel === 'damn_hot' ? '🔥🔥' : '🔥';
      lines.push(`  ${emoji} ${p.displayName ?? p.name}: ${p.currentStreak}er Streak`);
    }
  }

  lines.push('\n🎯 Tipps abgeben: https://pennypiranha.app');

  await sendWhatsApp(token, phoneId, groupId, lines.join('\n'));
  console.log('[WhatsApp] Daily summary sent');
}
