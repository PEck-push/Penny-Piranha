import type { Context } from '@netlify/functions';
import { verifyAdmin } from './_lib/adminAuth';
import { sendWaMessage } from './_lib/whatsapp';

// HTTP POST — admin-only. Sends a fixed test message to the WhatsApp group
// to verify bot connectivity. Body not required.
export default async (req: Request, _context: Context) => {
  const authResult = await verifyAdmin(req);
  if (!authResult.ok) {
    return json({ error: authResult.error }, authResult.status ?? 401);
  }

  try {
    await sendWaMessage('🧪 Test-Nachricht von Penny Piranha WM 2026 – alles ok!');
    return json({ ok: true });
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
