import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';
import { fetchMatches, normalizeGroup, stageToPhase, mapStatus, regulationScore } from './_lib/footballData';

// HTTP endpoint, triggered by the admin from inside the app.
// Fetches the full WM 2026 fixture list from football-data.org and writes
// each match into the Firestore `schedule` collection.
//
// Authorisation: send header `Authorization: Bearer <Firebase ID Token>`
// of a logged-in admin (email must be in the admin list).
export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status ?? 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
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
          // 90-Min-Stand (ohne Verlängerung/Elfer) — konsistent zur 1X2-Auflösung.
          scoreA: regulationScore(m).home,
          scoreB: regulationScore(m).away,
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
