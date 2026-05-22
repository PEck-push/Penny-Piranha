import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { fetchMatches, normalizeGroup, stageToPhase, mapStatus } from './_lib/footballData';

// HTTP endpoint, triggered by the admin from inside the app.
// Fetches the full WM 2026 fixture list from football-data.org and writes
// each match into the Firestore `schedule` collection.
//
// Protected by a shared secret: send header `x-admin-secret: <ADMIN_SECRET>`
// or query param `?secret=<ADMIN_SECRET>`.
export default async (req: Request, _context: Context) => {
  const secret = process.env.ADMIN_SECRET;
  const url = new URL(req.url);
  const provided = req.headers.get('x-admin-secret') ?? url.searchParams.get('secret');
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const competition = url.searchParams.get('competition') ?? 'WC';

  try {
    const matches = await fetchMatches(competition);
    const db = getDb();

    let batch = db.batch();
    let ops = 0;
    let written = 0;

    for (const m of matches) {
      const docId = `wc-${m.id}`;
      const ref = db.collection('schedule').doc(docId);
      batch.set(
        ref,
        {
          footballDataOrgId: m.id,
          phase: stageToPhase(m.stage),
          groupLabel: normalizeGroup(m.group),
          teamA: m.homeTeam?.name ?? 'TBD',
          teamB: m.awayTeam?.name ?? 'TBD',
          kickoffAt: new Date(m.utcDate).getTime(),
          matchday: m.matchday ?? null,
          status: mapStatus(m.status),
          scoreA: m.score?.fullTime?.home ?? null,
          scoreB: m.score?.fullTime?.away ?? null,
        },
        { merge: true },
      );
      written++;
      ops++;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    return new Response(JSON.stringify({ ok: true, imported: written }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
