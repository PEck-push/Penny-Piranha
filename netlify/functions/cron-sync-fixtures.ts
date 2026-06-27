import type { Config } from '@netlify/functions';
import { verifyCron } from './_lib/cronAuth';
import { syncFixtures } from './_lib/syncFixtures';

// Täglicher Check: holt die Begegnungen aus der API und spielt neu festgelegte
// K.-o.-Paarungen (TBD → echte Teams) in schedule-Docs und noch offene/gesperrte
// WM-Märkte ein. Scores/Status bleiben unangetastet (auto-resolve/Korrektur).
// Läuft 1×/Tag um 07:00 UTC (vor der daily-summary um 08:00).
export default async (req: Request) => {
  if (!(await verifyCron(req))) return new Response('forbidden', { status: 403 });
  try {
    const report = await syncFixtures({ dryRun: false });
    return new Response(JSON.stringify({
      ok: true,
      fetched: report.fetched,
      scheduleUpdated: report.scheduleUpdated,
      marketsUpdated: report.marketsUpdated.length,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[cron-sync-fixtures] error:', err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  schedule: '0 7 * * *',
};
