import type { Context } from '@netlify/functions';
import { getDb, getAdminAuth, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin, adminEmails } from './_lib/adminAuth';

// "Live gehen" — beendet den Testmodus und setzt alle Daten zurück.
// Löscht alle Nicht-Admin-User (Firebase Auth + Firestore players) sowie
// alle Wetten, Märkte, Antworten, Feed-Einträge und Auto-Abzüge.
// Der importierte Spielplan (schedule) bleibt erhalten.
//
// Aufruf vom Admin-Panel via POST mit Header:
//   Authorization: Bearer <Firebase ID Token des eingeloggten Admins>

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authResult = await verifyAdmin(req);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status ?? 401);

  const admins = adminEmails();

  // Reset durchführen
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

      const slug = data.name ? String(data.name).trim().toLowerCase().replace(/[/.#$[\]]/g, '_') : '';

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
        // Namens-Reservierung des Admins sicherstellen (Eindeutigkeit lebt jetzt
        // in der usernames-Collection), damit der Name nicht neu vergeben wird.
        if (slug) {
          await db.collection('usernames').doc(slug).set(
            { uid: docSnap.id, name: data.name, createdAt: Date.now() }, { merge: true });
        }
      } else {
        // Nicht-Admin: Firestore-Dokument + Namens-Reservierung + Auth-Account löschen
        await docSnap.ref.delete();
        if (slug) { await db.collection('usernames').doc(slug).delete().catch(() => {}); }
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
        currentMatchday: '',
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
