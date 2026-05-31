import type { Context } from '@netlify/functions';
import { getDb, getAdminAuth, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';

// "Komplett-Reset vor Go-Live" — bereitet die App auf den echten Stammgast-
// Start vor. Im Unterschied zu /go-live (das testMode endgültig auf false
// kippt) lässt diese Function testMode auf TRUE, damit der Admin nach dem
// Reset noch in Ruhe testen kann und erst mit dem separaten "Live gehen"-
// Button endgültig in den Echtbetrieb wechselt.
//
// Verhalten:
//   1. Alle Spieler ausser Michael Matouschowsky und Philipp Eckhardt
//      werden gelöscht (Firestore-Doc + Auth-User + Namens-Reservierung).
//   2. Die beiden verbleibenden Spieler erhalten:
//        - isAdmin: true (App-UI; verifyAdmin braucht zusätzlich die Email
//          in ADMIN_EMAILS, siehe Hinweis im Response).
//        - Charakter-Reset (Kopf/Körper/Avatar geleert, needsCharacter: true)
//          — beide müssen nach dem Reset ihren Charakter neu wählen.
//        - Token-Stand auf 1000, alle Streaks/Inventar/Badges zurück.
//   3. bets, markets, answers, feed, autoDeductions werden geleert.
//   4. appState: jackpot=0, currentMatchday='', hausbank=0; testMode TRUE
//      bleibt — Go-Live ist ein separater Schritt.
//
// Auth: nur Admin (verifyAdmin).

const KEEP_NAMES = new Set([
  'Michael Matouschowsky',
  'Philipp Eckhardt',
]);

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authRes = await verifyAdmin(req);
  if (!authRes.ok) return json({ error: authRes.error }, authRes.status ?? 401);

  try {
    const db = getDb();
    const adminAuth = getAdminAuth();

    const playersSnap = await db.collection('players').get();
    const kept: { uid: string; name: string; email?: string }[] = [];
    const deletedAuthUids: string[] = [];
    let deletedPlayers = 0;

    for (const docSnap of playersSnap.docs) {
      const data = docSnap.data() as any;
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const slug = name ? name.toLowerCase().replace(/[/.#$[\]]/g, '_') : '';
      const isKept = KEEP_NAMES.has(name);

      if (isKept) {
        // Vollständiger Spielreset + Charakter-Reset + Admin.
        await docSnap.ref.update({
          isAdmin: true,
          approved: true,
          tokens: 1000,
          buybackUsed: false,
          comboMalus: false,
          badges: [],
          currentStreak: 0,
          bestStreak: 0,
          streakLevel: 'none',
          streakHistory: [],
          austriaSpecialCorrect: 0,
          underdogCorrect: 0,
          dailyNetGain: 0,
          unseenResolutions: [],
          unlockedOverlays: [],
          activeAccessoryId: null,
          activeAccessories: {},
          activeBadgeId: null,
          shopInventory: [],
          activeShopItems: {},
          lastShopVisitTs: 0,
          // Charakter-Reset — Spieler durchläuft beim nächsten Login die
          // Charakterauswahl erneut.
          headId: '',
          bodyId: '',
          avatar: '',
          avatarId: '',
          avatarColor: '',
          characterLocked: false,
          needsCharacter: true,
        });
        if (slug) {
          await db.collection('usernames').doc(slug).set(
            { uid: docSnap.id, name, createdAt: Date.now() }, { merge: true });
        }
        kept.push({ uid: docSnap.id, name, email: data.email });
      } else {
        await docSnap.ref.delete();
        if (slug) await db.collection('usernames').doc(slug).delete().catch(() => {});
        deletedPlayers++;
        try {
          await adminAuth.deleteUser(docSnap.id);
          deletedAuthUids.push(docSnap.id);
        } catch {
          // Auth-User nicht vorhanden (UID != Auth-UID) — ignorieren.
        }
      }
    }

    // Spieldaten leeren (schedule + shopItems-Katalog + appState bleiben).
    const wiped: Record<string, number> = {};
    for (const colName of ['bets', 'markets', 'answers', 'feed', 'autoDeductions']) {
      const snap = await db.collection(colName).get();
      let count = 0;
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

    // Shop: verkaufte Stückzahlen zurücksetzen (knappe Items werden wieder
    // verfügbar). Katalog selbst bleibt.
    const shopSnap = await db.collection('shopItems').get();
    for (const d of shopSnap.docs) {
      const data = d.data() as any;
      if (data.sold) await d.ref.update({ sold: 0 });
    }

    // appState — testMode TRUE belassen (Go-Live separat), Jackpot/Matchday
    // zurück, adminMessage leer.
    await db.collection('appState').doc('global').set(
      {
        testMode: true,
        jackpot: 0,
        hausbank: 0,
        tournamentActive: true,
        currentMatchday: '',
        shopLastDropTs: 0,
        adminMessage: '',
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return json({
      ok: true,
      message: 'Komplett-Reset abgeschlossen. Michael Matouschowsky und Philipp Eckhardt sind Admins und müssen ihren Charakter neu wählen.',
      kept,
      deletedPlayers,
      deletedAuthUsers: deletedAuthUids.length,
      wiped,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Reset fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
