import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { sendWaMessage } from './_lib/whatsapp';

// Daily preview: sent at 08:00 UTC (10:00 CEST).
// Lists all WM matches scheduled for today and links to the app.
export default async () => {
  const db = getDb();

  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const snap = await db.collection('schedule')
    .where('kickoffAt', '>=', dayStart)
    .where('kickoffAt', '<', dayEnd)
    .orderBy('kickoffAt', 'asc')
    .get();

  if (snap.empty) {
    console.log('[whatsapp-preview] Heute keine Spiele — kein Send.');
    return new Response('no games today');
  }

  const lines = snap.docs.map(d => {
    const m = d.data() as any;
    const dt = new Date(m.kickoffAt);
    const h = String(dt.getUTCHours()).padStart(2, '0');
    const min = String(dt.getUTCMinutes()).padStart(2, '0');
    return `⚽ ${h}:${min}  ${m.teamA} vs. ${m.teamB}`;
  });

  const text = [
    "🏆 WM 2026 – Heute's Spiele",
    '',
    ...lines,
    '',
    'Jetzt tippen → https://penny-piranha.netlify.app',
  ].join('\n');

  await sendWaMessage(text);
  console.log(`[whatsapp-preview] ${lines.length} Spiele gesendet.`);
  return new Response('ok');
};

export const config: Config = {
  schedule: '0 8 * * *',
};
