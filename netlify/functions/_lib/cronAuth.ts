// Schutz für geplante Funktionen (tick, auto-resolve), die andernfalls öffentlich
// per HTTP aufrufbar wären und Tokens abziehen / Auszahlungen auslösen könnten.
//
// Verhalten (bricht den Cron NIE):
//   • Geplante Netlify-Invokation (Body enthält "next_run") → immer erlaubt.
//   • Manueller Aufruf mit ?key=<CRON_SECRET> oder Header x-cron-secret → erlaubt.
//   • CRON_SECRET NICHT gesetzt → offen (abwärtskompatibel; Härtung ist Opt-in).
//   • Sonst → blockiert.
//
// Aktivierung der Härtung: in den Netlify-Env-Variablen CRON_SECRET setzen.
// Geplante Läufe funktionieren weiterhin (next_run-Erkennung ist unabhängig vom
// Secret); nur fremde manuelle Aufrufe werden dann abgewiesen.
export async function verifyCron(req: Request): Promise<boolean> {
  // 1) Geplante Invokation erkennen (Netlify sendet JSON-Body mit next_run).
  try {
    const body = await req.clone().text();
    if (body && body.includes('next_run')) return true;
  } catch { /* kein Body lesbar */ }

  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // nicht konfiguriert → offen lassen

  try {
    const url = new URL(req.url);
    if (url.searchParams.get('key') === secret) return true;
  } catch { /* ungültige URL */ }
  if ((req.headers.get('x-cron-secret') ?? '') === secret) return true;

  return false;
}
