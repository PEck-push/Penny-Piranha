import type { Context } from '@netlify/functions';
import { getAdminAuth } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// Admin: setzt das Login-Passwort eines Spielers (Firebase Authentication) neu.
//
// WICHTIG: Diese Funktion fasst AUSSCHLIESSLICH das Auth-Passwort an. Sie ändert
// NICHTS am Spieler-Dokument (Tokens, Tipps, Badges, Streak, Fortschritt) und
// NICHTS an Account/UID/E-Mail. Dieselbe UID bleibt erhalten → der komplette
// Truppenstand und Account bleibt unverändert. Nur das Passwort wird ersetzt.
//
// Body: { playerId, newPassword }
//   playerId    — Firestore-Spieler-Doc-ID == Firebase-Auth-UID
//   newPassword — neues Passwort (min. 6 Zeichen, Firebase-Vorgabe)

interface Body { playerId?: string; newPassword?: string; }

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }

  const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!playerId) return json({ error: 'playerId erforderlich.' }, 400);
  if (newPassword.length < 6) return json({ error: 'Passwort muss mindestens 6 Zeichen haben.' }, 400);

  try {
    // Nur das Passwort des bestehenden Auth-Users (playerId == UID) setzen.
    // Kein Touch am Firestore-Spieler-Dokument → Fortschritt bleibt unangetastet.
    await getAdminAuth().updateUser(playerId, { password: newPassword });
    return json({ ok: true });
  } catch (err: any) {
    const code = err?.code ?? '';
    if (code === 'auth/user-not-found') {
      return json({ error: 'Kein Auth-Konto zu dieser Spieler-ID gefunden.', code }, 404);
    }
    return json({ error: err?.message ?? 'Passwort setzen fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
