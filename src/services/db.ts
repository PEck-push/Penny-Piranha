import { collection, doc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer, INITIAL_PLAYERS } from '../store';

export const initFirebaseSync = async () => {
  if (!db) {
    console.warn("Firebase nicht konfiguriert — nur localStorage aktiv.");
    return;
  }

  // ── AUTO-SEED: Wenn noch keine Spieler in Firestore existieren, anlegen ──
  // Das passiert nur beim allerersten Start oder nach einem Reset.
  try {
    const existingPlayers = await getDocs(collection(db, 'players'));
    if (existingPlayers.empty) {
      console.log('[Firebase] Keine Spieler gefunden — lege Initial-Daten an...');
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
      console.log('[Firebase] Initial-Daten erfolgreich angelegt ✓');
    }
  } catch (err) {
    console.error('[Firebase] Fehler beim Auto-Seed:', err);
  }

  const playersRef  = collection(db, 'players');
  const marketsRef  = collection(db, 'markets');
  const betsRef     = collection(db, 'bets');
  const answersRef  = collection(db, 'answers');
  const appStateRef = doc(db, 'appState', 'global');

  // ── LIVE-SYNC: Änderungen von Firebase in den lokalen State schreiben ──

  onSnapshot(playersRef, snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    if (players.length === 0) return;

    const currentUser = useStore.getState().currentUser;

    if (currentUser) {
      const firebaseMe = players.find(p => p.id === currentUser);

      // Admin hat Reset gemacht → User ausloggen
      if (firebaseMe && firebaseMe.loggedIn === false) {
        useStore.getState().logout();
        useStore.setState({ players });
        return;
      }

      // Eigene frische Login-Daten nicht von Firebase überschreiben lassen
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
  }, err => console.error('[Firebase] players snapshot Fehler:', err));

  onSnapshot(marketsRef, snap => {
    const markets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Market));
    useStore.setState({ markets });
  }, err => console.error('[Firebase] markets snapshot Fehler:', err));

  onSnapshot(betsRef, snap => {
    const bets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet));
    useStore.setState({ bets });
  }, err => console.error('[Firebase] bets snapshot Fehler:', err));

  onSnapshot(answersRef, snap => {
    const answers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Answer));
    useStore.setState({ answers });
  }, err => console.error('[Firebase] answers snapshot Fehler:', err));

  onSnapshot(appStateRef, snap => {
    if (snap.exists()) useStore.setState({ jackpot: snap.data().jackpot ?? 0 });
  }, err => console.error('[Firebase] appState snapshot Fehler:', err));
};

// ── RESET: Wird vom Admin-Panel aufgerufen ──────────────────────────────────
export const resetToInitialState = async (initialPlayers: Player[], initialMarkets: Market[]) => {
  if (!db) return;

  try {
    const batch = writeBatch(db);

    // Alle Wetten, Märkte, Antworten löschen
    for (const colName of ['bets', 'markets', 'answers']) {
      const snap = await getDocs(collection(db, colName));
      snap.forEach(d => batch.delete(d.ref));
    }

    // Spieler komplett zurücksetzen
    initialPlayers.forEach(p => {
      batch.set(doc(db, 'players', p.id), {
        ...p,
        avatar: '',
        avatarId: '',
        avatarColor: '',
        loggedIn: false,
      });
    });

    initialMarkets.forEach(m => batch.set(doc(db, 'markets', m.id), m));
    batch.set(doc(db, 'appState', 'global'), { jackpot: 0 });

    await batch.commit();
    console.log('[Firebase] Reset erfolgreich ✓');
  } catch (err) {
    console.error('[Firebase] Fehler beim Reset:', err);
  }
};