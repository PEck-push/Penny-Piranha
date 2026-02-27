import { collection, doc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer, INITIAL_PLAYERS } from '../store';

export const initFirebaseSync = async () => {
  if (!db) {
    console.warn('[Firebase] Nicht konfiguriert.');
    return;
  }

  // ── AUTO-SEED: Spieler anlegen falls Firestore noch leer ist ─────────────────
  // Passiert nur beim allerersten Start. Danach lebt alles in Firebase.
  try {
    const existingPlayers = await getDocs(collection(db, 'players'));
    if (existingPlayers.empty) {
      console.log('[Firebase] Erststart erkannt — lege Spieler an...');
      const batch = writeBatch(db);
      INITIAL_PLAYERS.forEach(p => {
        batch.set(doc(db, 'players', p.id), {
          ...p,
          avatar: '',
          avatarId: '',
          avatarColor: '',
          loggedIn: false,
        });
      });
      batch.set(doc(db, 'appState', 'global'), { jackpot: 0 });
      await batch.commit();
      console.log('[Firebase] Spieler erfolgreich angelegt ✓');
    }
  } catch (err) {
    console.error('[Firebase] Auto-Seed Fehler:', err);
  }

  // ── LIVE-SYNC: Firebase → Zustand ────────────────────────────────────────────
  // Ab hier ist Firebase die einzige Wahrheit. Jede Änderung in Firestore
  // (von dir ODER anderen Geräten) landet sofort im lokalen State.

  onSnapshot(collection(db, 'players'), snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    if (players.length === 0) return; // Kein Überschreiben mit leerer Liste

    const currentUser = useStore.getState().currentUser;
    if (currentUser) {
      const firebaseMe = players.find(p => p.id === currentUser);
      // Admin hat Reset gemacht → User ausloggen
      if (firebaseMe && firebaseMe.loggedIn === false) {
        useStore.getState().logout();
        useStore.setState({ players });
        return;
      }
      // Eigene frische Login-Daten schützen
      const localMe = useStore.getState().players.find(p => p.id === currentUser);
      const merged = players.map(p =>
        p.id === currentUser && localMe?.loggedIn
          ? { ...p, avatar: localMe.avatar, avatarId: localMe.avatarId, avatarColor: localMe.avatarColor, loggedIn: true }
          : p
      );
      useStore.setState({ players: merged });
    } else {
      useStore.setState({ players });
    }
  }, err => console.error('[Firebase] players Fehler:', err));

  onSnapshot(collection(db, 'markets'), snap => {
    const markets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Market));
    useStore.setState({ markets });
  }, err => console.error('[Firebase] markets Fehler:', err));

  onSnapshot(collection(db, 'bets'), snap => {
    const bets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet));
    useStore.setState({ bets });
  }, err => console.error('[Firebase] bets Fehler:', err));

  onSnapshot(collection(db, 'answers'), snap => {
    const answers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Answer));
    useStore.setState({ answers });
  }, err => console.error('[Firebase] answers Fehler:', err));

  onSnapshot(doc(db, 'appState', 'global'), snap => {
    if (snap.exists()) useStore.setState({ jackpot: snap.data().jackpot ?? 0 });
  }, err => console.error('[Firebase] appState Fehler:', err));
};

// ── RESET: Alles auf Anfang setzen (Admin-Panel) ──────────────────────────────
export const resetToInitialState = async (initialPlayers: Player[], initialMarkets: Market[]) => {
  if (!db) return;
  try {
    const batch = writeBatch(db);
    for (const colName of ['bets', 'markets', 'answers']) {
      const snap = await getDocs(collection(db, colName));
      snap.forEach(d => batch.delete(d.ref));
    }
    initialPlayers.forEach(p => {
      batch.set(doc(db, 'players', p.id), {
        ...p, avatar: '', avatarId: '', avatarColor: '', loggedIn: false,
      });
    });
    initialMarkets.forEach(m => batch.set(doc(db, 'markets', m.id), m));
    batch.set(doc(db, 'appState', 'global'), { jackpot: 0 });
    await batch.commit();
    console.log('[Firebase] Reset erfolgreich ✓');
  } catch (err) {
    console.error('[Firebase] Reset Fehler:', err);
  }
};