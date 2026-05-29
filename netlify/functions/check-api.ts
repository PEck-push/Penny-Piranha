import type { Context } from '@netlify/functions';
import https from 'node:https';
import { verifyAdmin } from './_lib/adminAuth';

// Diagnostic endpoint (ADMIN-ONLY). Feuert mehrere football-data.org-Calls und
// war zuvor offen → Quota-DoS-Vektor. Jetzt nur mit Admin-ID-Token aufrufbar:
//   Authorization: Bearer <Firebase ID Token>
// Bestätigt, dass der API-Token funktioniert und welche Bewerbe verfügbar sind.
export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ ok: false, error: authResult.error }, authResult.status ?? 401);

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'FOOTBALL_DATA_API_KEY ist nicht gesetzt (Netlify Environment variables).' }, 500);
  }

  try {
    const comps = await get('/v4/competitions/', apiKey);
    const list = (comps.competitions ?? []).map((c: any) => ({
      code: c.code,
      name: c.name,
      season: c.currentSeason?.startDate
        ? `${c.currentSeason.startDate} → ${c.currentSeason.endDate}`
        : '—',
    }));
    const wc = list.find((c: any) => c.code === 'WC');

    // WC match details: total, finished, scheduled + earliest dates
    let wcMatchCount: number | string = 'nicht abgefragt';
    let wcFinishedCount: number | string = 0;
    let wcScheduledCount: number | string = 0;
    let wcEarliestScheduled: string | null = null;
    let wcEarliestFinished: string | null = null;

    if (wc) {
      try {
        const [allM, finishedM, scheduledM] = await Promise.all([
          get('/v4/competitions/WC/matches', apiKey),
          get('/v4/competitions/WC/matches?status=FINISHED', apiKey),
          get('/v4/competitions/WC/matches?status=SCHEDULED', apiKey),
        ]);

        wcMatchCount = (allM.matches ?? []).length;
        wcFinishedCount = (finishedM.matches ?? []).length;
        wcScheduledCount = (scheduledM.matches ?? []).length;

        const scheduled = [...(scheduledM.matches ?? [])] as any[];
        scheduled.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
        wcEarliestScheduled = scheduled[0]?.utcDate ?? null;

        const finished = [...(finishedM.matches ?? [])] as any[];
        finished.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
        wcEarliestFinished = finished[0]?.utcDate ?? null;
      } catch (e: any) {
        wcMatchCount = `Fehler: ${e.message}`;
      }
    }

    return json({
      ok: true,
      tokenWorks: true,
      worldCupAvailable: !!wc,
      worldCup: wc ?? null,
      worldCupMatchCount: wcMatchCount,
      worldCupFinishedCount: wcFinishedCount,
      worldCupScheduledCount: wcScheduledCount,
      worldCupEarliestScheduled: wcEarliestScheduled,
      worldCupEarliestFinished: wcEarliestFinished,
      allCompetitions: list,
    });
  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
};

function get(path: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get({ hostname: 'api.football-data.org', path, headers: { 'X-Auth-Token': apiKey } }, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) return reject(new Error(j.message || `HTTP ${res.statusCode}`));
            resolve(j);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
