import type { Context } from '@netlify/functions';
import https from 'node:https';

// Diagnostic endpoint. Open in browser after deploy:
//   https://<your-site>.netlify.app/.netlify/functions/check-api
// Confirms the football-data.org token works and lists which competitions
// (and thus whether the World Cup "WC" + 2026 season) are available to it.
export default async (_req: Request, _context: Context) => {
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

    // Also try the WC match count directly
    let wcMatches: number | string = 'nicht abgefragt';
    if (wc) {
      try {
        const m = await get('/v4/competitions/WC/matches', apiKey);
        wcMatches = (m.matches ?? []).length;
      } catch (e: any) {
        wcMatches = `Fehler: ${e.message}`;
      }
    }

    return json({
      ok: true,
      tokenWorks: true,
      worldCupAvailable: !!wc,
      worldCup: wc ?? null,
      worldCupMatchCount: wcMatches,
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
