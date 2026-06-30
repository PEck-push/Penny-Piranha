import type { Context } from '@netlify/functions';
import { verifyAdmin } from './_lib/adminAuth';
import { correctMatchResolution } from './_lib/correctResolution';

// HTTP POST — admin-only. Korrigiert eine FEHLERHAFTE Auflösung eines Standard-
// Marktes (z. B. falsche Gewinner-Option durch fehlerhafte Daten-API).
// Body:
//   { marketId, winningOptionId, apply?: boolean, score?: { home, away } }
//   apply !== true  → Probelauf (dry-run): liefert nur den Report, schreibt nichts.
//   apply === true  → Korrektur wird tatsächlich verbucht.
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { marketId, winningOptionId, apply, score, penalties } = body ?? {};
  if (!marketId || !winningOptionId) return json({ error: 'marketId und winningOptionId sind erforderlich.' }, 400);

  try {
    const report = await correctMatchResolution(marketId, String(winningOptionId), {
      dryRun: apply !== true,
      score: score && typeof score.home === 'number' && typeof score.away === 'number'
        ? { home: score.home, away: score.away }
        : undefined,
      penalties: penalties && typeof penalties.home === 'number' && typeof penalties.away === 'number'
        ? { home: penalties.home, away: penalties.away }
        : undefined,
    });
    return json(report);
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? 'Korrektur fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
