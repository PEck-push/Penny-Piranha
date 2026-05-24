// Shared helper — sends a text message to the configured WhatsApp group
// via the Fly.io Baileys microservice.
// Env vars required: WA_SERVICE_URL (POST endpoint), WA_SECRET (Bearer token).
export async function sendWaMessage(text: string): Promise<void> {
  const url = process.env.WA_SERVICE_URL;
  const secret = process.env.WA_SECRET;
  if (!url || !secret) throw new Error('WA_SERVICE_URL oder WA_SECRET nicht konfiguriert');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WhatsApp-Service Fehler ${res.status}: ${body}`);
  }
}
