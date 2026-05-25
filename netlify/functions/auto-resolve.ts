import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { fetchMatches } from './_lib/footballData';
import { resolveMarketAdmin } from './_lib/resolve';

// Runs every 5 minutes. Fetches FINISHED matches from football-data.org and
// resolves the corresponding locked WM markets automatically. Also keeps the
// `schedule` docs in sync with the live scores.
export default async () => {
  const db = getDb();

  let finished;
  try {
    finished = await fetchMatches('WC', 'FINISHED');
  } catch (err: any) {
    console.error('[auto-resolve] API error:', err.message);
    return new Response('api-error', { status: 200 });
  }

  // Locked WM markets keyed by footballDataOrgId
  const lockedSnap = await db
    .collection('markets')
    .where('status', '==', 'locked')
    .where('marketSubtype', '==', 'wm-match')
    .get();

  const marketByFdoId = new Map<number, { id: string; data: any }>();
  lockedSnap.forEach(d => {
    const data = d.data();
    if (typeof data.footballDataOrgId === 'number') {
      marketByFdoId.set(data.footballDataOrgId, { id: d.id, data });
    }
  });

  let resolved = 0;

  for (const m of finished) {
    const home = m.score?.fullTime?.home;
    const away = m.score?.fullTime?.away;
    if (home === null || away === null || home === undefined || away === undefined) continue;

    // Keep schedule doc in sync
    const schedRef = db.collection('schedule').doc(`wc-${m.id}`);
    await schedRef.set({ status: 'finished', scoreA: home, scoreB: away }, { merge: true });

    const entry = marketByFdoId.get(m.id);
    if (!entry) continue;

    const options: Array<{ id: string }> = entry.data.options ?? [];
    let winningOptionId: string;
    if (home > away) winningOptionId = 'home';
    else if (away > home) winningOptionId = 'away';
    else winningOptionId = 'draw';

    // Fallback to positional option ids if custom labels were used
    if (!options.find(o => o.id === winningOptionId)) {
      const idx = home > away ? 0 : away > home ? 2 : 1;
      winningOptionId = options[idx]?.id ?? winningOptionId;
    }

    try {
      await resolveMarketAdmin(entry.id, winningOptionId, 'auto');
      resolved++;
      console.log(`[auto-resolve] ${entry.data.teamA} ${home}-${away} ${entry.data.teamB} → ${winningOptionId}`);
    } catch (err: any) {
      console.error(`[auto-resolve] failed market ${entry.id}:`, err.message);
    }
  }

  return new Response(JSON.stringify({ resolved }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  schedule: '*/15 * * * *',
};
