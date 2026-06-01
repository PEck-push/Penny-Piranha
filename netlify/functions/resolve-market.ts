import type { Context } from '@netlify/functions';
import { verifyAdmin } from './_lib/adminAuth';
import {
  resolveMarketAdmin,
  rolloverMarketAdmin,
  stornoMarketAdmin,
  resolveOpenQuestionAdmin,
} from './_lib/resolve';

// HTTP POST — admin-only. Zentraler, atomarer Auflösungs-Endpunkt für das
// Admin-Panel. Body:
//   { action: 'win',      marketId, winningOptionId, winningOptionIds? }
//                                                          → Gewinner-Auflösung
//                                                            (Array fuer Multi-Winner)
//   { action: 'rollover', marketId }                        → 50% Einsatz zurück
//   { action: 'storno',   marketId }                        → 100% Einsatz zurück
//   { action: 'open',     marketId, winnerPlayerIds: [] }   → offene Frage auswerten
export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, marketId, winningOptionId, winningOptionIds, winnerPlayerIds } = body ?? {};
  if (!marketId || !action) return json({ error: 'marketId und action sind erforderlich.' }, 400);

  try {
    let result;
    switch (action) {
      case 'win': {
        // Multi-Winner-Body akzeptieren — Array hat Vorrang. Der "primaere"
        // winningOptionId wird auf den ersten Eintrag der Liste gehoben, das
        // volle Set bleibt fuer die Aufloesung erhalten.
        const multiIds: string[] | undefined = Array.isArray(winningOptionIds) && winningOptionIds.length > 0
          ? winningOptionIds.map(String)
          : undefined;
        const primaryId: string = multiIds ? multiIds[0] : winningOptionId;
        if (!primaryId) return json({ error: 'winningOptionId oder winningOptionIds fehlt.' }, 400);
        result = await resolveMarketAdmin(marketId, primaryId, 'admin', undefined, multiIds);
        break;
      }
      case 'rollover':
        result = await rolloverMarketAdmin(marketId, 'admin');
        break;
      case 'storno':
        result = await stornoMarketAdmin(marketId, 'admin');
        break;
      case 'open':
        result = await resolveOpenQuestionAdmin(marketId, Array.isArray(winnerPlayerIds) ? winnerPlayerIds.map(String) : [], 'admin');
        break;
      default:
        return json({ error: `Unbekannte action: ${action}` }, 400);
    }
    return json({ ok: true, ...result });
  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
