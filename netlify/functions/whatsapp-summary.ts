import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { sendWaMessage } from './_lib/whatsapp';

// Daily summary: sent at 07:00 UTC (09:00 CEST).
// Shows leaderboard Top 3, Spieltagskönig, Arschkarte, active streaks.
// Also snapshots tokensAtDayStart for the next day's comparison.
export default async () => {
  const db = getDb();

  const playersSnap = await db.collection('players').get();
  if (playersSnap.empty) return new Response('no players');

  const players = playersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const realPlayers = players.filter(p => !p.isTestPlayer);
  if (realPlayers.length === 0) {
    await snapshotDayStart(db, players);
    return new Response('no real players');
  }

  const sorted = [...realPlayers].sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0));

  const gains = realPlayers.map(p => ({
    name: p.displayName ?? p.name ?? '?',
    gain: (p.tokens ?? 0) - (p.tokensAtDayStart ?? (p.tokens ?? 0)),
  })).sort((a, b) => b.gain - a.gain);

  const hasActivity = gains.some(g => g.gain !== 0);
  if (!hasActivity) {
    console.log('[whatsapp-summary] Keine Aktivität gestern — kein Send.');
    await snapshotDayStart(db, players);
    return new Response('no activity');
  }

  const medals = ['🏆', '🥈', '🥉'];
  const top3 = sorted.slice(0, 3)
    .map((p, i) => `${medals[i]} ${p.displayName ?? p.name ?? '?'} ${p.tokens ?? 0}`)
    .join(' · ');

  const topGainer = gains[0];
  const topLoser = gains[gains.length - 1];

  const onFire = realPlayers
    .filter(p => p.streakLevel === 'on_fire' || p.streakLevel === 'damn_hot')
    .map(p => `${p.displayName ?? p.name ?? '?'} (${p.currentStreak ?? 0}er)`)
    .join(' · ');

  const lines: string[] = ['📊 WM 2026 – Tagesauswertung', '', top3];

  if (topGainer && topGainer.gain > 0) {
    lines.push(`🔥 Spieltagskönig: ${topGainer.name} (+${topGainer.gain} TKN)`);
  }
  if (topLoser && topLoser.gain < 0) {
    lines.push(`💸 Arschkarte: ${topLoser.name} (${topLoser.gain} TKN)`);
  }
  if (onFire) {
    lines.push(`🔥 On Fire: ${onFire}`);
  }

  await sendWaMessage(lines.join('\n'));
  await snapshotDayStart(db, players);
  console.log('[whatsapp-summary] Zusammenfassung gesendet.');
  return new Response('ok');
};

async function snapshotDayStart(db: any, players: any[]) {
  const batchSize = 500;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = db.batch();
    players.slice(i, i + batchSize).forEach((p: any) => {
      batch.update(db.collection('players').doc(p.id), { tokensAtDayStart: p.tokens ?? 0 });
    });
    await batch.commit();
  }
}

export const config: Config = {
  schedule: '0 7 * * *',
};
