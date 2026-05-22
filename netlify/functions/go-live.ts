import type { Context } from '@netlify/functions';
import { getDb, getAdminAuth, FieldValue } from './_lib/firebaseAdmin';

// "Live gehen" — beendet den Testmodus und setzt alle Daten zurück.
// Löscht alle Nicht-Admin-User (Firebase Auth + Firestore players) sowie
// alle Wetten, Märkte, Antworten, Feed-Einträge und Auto-Abzüge.
// Der importierte Spielplan (schedule) bleibt erhalten.
//
// Aufruf vom Admin-Panel via POST mit Header:
//   Authorization: Bearer <Firebase ID Token des eingeloggten Admins>
//
// Autorisierung: Der Token muss zu einer E-Mail aus ADMIN_EMAILS gehören.

const FALLBACK_ADMIN_EMAILS = ['marketing@gwt.at'];

function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const all = [...FALLBACK_ADMIN_EMAILS.map(e => e.toLowerCase()), ...fromEnv];
  return Array.from(new Set(all));
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. Auth-Token verifizieren
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json({ error: 'Kein Auth-Token übermittelt.' }, 401);

  const admins = adminEmails();
  let callerEmail: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    callerEmail = decoded.email?.toLowerCase();
  } catch {
    return json({ error: 'Ungültiger oder abgelaufener Token.' }, 401);
  }
  if (!callerEmail || !admins.includes(callerEmail)) {
    return json({ error: 'Nicht autorisiert. Nur Admins dürfen live gehen.' }, 403);
  }

  // 2. Reset durchführen
  try {
    const db = getDb();
    const auth = getAdminAuth();

    // 2a. Alle Spieler-Dokumente: Admins behalten (reset), Rest löschen
    const playersSnap = await db.collection('players').get();
    const deletedAuthUids: string[] = [];
    let deletedPlayers = 0;

    for (const docSnap of playersSnap.docs) {
      const data = docSnap.data();
      const email = (data.email as string | undefined)?.toLowerCase();
      const isAdmin = !!email && admins.includes(email);

      if (isAdmin) {
        // Admin-Spieler auf Startzustand zurücksetzen
        await docSnap.ref.update({
          tokens: 1000,
          buybackUsed: false,
          currentStreak: 0,
          bestStreak: 0,
          streakLevel: 'none',
          streakHistory: [],
          austriaSpecialCorrect: 0,
          underdogCorrect: 0,
          dailyNetGain: 0,
          unlockedOverlays: [],
          activeAccessoryId: null,
          activeBadgeId: null,
          unseenResolutions: [],
          badges: [],
          comboMalus: false,
        });
      } else {
        // Nicht-Admin: Firestore-Dokument + Auth-Account löschen
        await docSnap.ref.delete();
        deletedPlayers++;
        const uid = docSnap.id;
        try {
          await auth.deleteUser(uid);
          deletedAuthUids.push(uid);
        } catch {
          // Auth-User existiert evtl. nicht (UID != Auth-UID) — ignorieren
        }
      }
    }

    // 2b. Collections leeren (schedule bleibt erhalten)
    const wiped: Record<string, number> = {};
    for (const colName of ['bets', 'markets', 'answers', 'feed', 'autoDeductions']) {
      const snap = await db.collection(colName).get();
      let count = 0;
      // In Batches von 400 löschen (Firestore-Limit: 500 pro Batch)
      let batch = db.batch();
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }
      await batch.commit();
      wiped[colName] = count;
    }

    // 2c. appState zurücksetzen + Testmodus deaktivieren (Invite-Code bleibt)
    await db.collection('appState').doc('global').set(
      {
        testMode: false,
        jackpot: 0,
        hausbank: 0,
        tournamentActive: true,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return json({
      ok: true,
      message: 'Testmodus beendet. Daten zurückgesetzt — die App ist jetzt live.',
      deletedPlayers,
      deletedAuthUsers: deletedAuthUids.length,
      wiped,
    });
  } catch (err: any) {
    return json({ error: err.message ?? 'Reset fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
