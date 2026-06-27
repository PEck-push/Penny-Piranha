import type { Context } from '@netlify/functions';
import { verifyAdmin } from './_lib/adminAuth';
import { syncFixtures } from './_lib/syncFixtures';

// HTTP POST — admin-only. Spielt die Begegnungen aus der API neu ein
// (K.-o.-Phase: TBD → echte Teams) in schedule-Docs UND noch offene/gesperrte
// WM-Märkte. Body: { apply?: boolean } — apply !== true → Probelauf (dry-run).
export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  try {
    const report = await syncFixtures({ dryRun: body?.apply !== true });
    return json(report);
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? 'Sync fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
