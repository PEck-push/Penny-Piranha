import { collection, doc, setDoc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer } from '../store';

export const initFirebaseSync = () => {
  if (!db) {
    console.warn("Firebase not configured — using localStorage only.");
    return;
  }

  const playersRef  = collection(db, 'players');
  const marketsRef  = collection(db, 'markets');
  const betsRef     = collection(db, 'bets');
  const answersRef  = collection(db, 'answers');
  const appStateRef = doc(db, 'appState', 'global');

  onSnapshot(playersRef, snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    if (players.length === 0) return;
    const currentUser = useStore.getState().currentUser;

    // If Firebase shows current user is no longer loggedIn (e.g. after a reset),
    // force logout so the cookie doesn't re-login them
    if (currentUser) {
      const firebaseMe = players.find(p => p.id === currentUser);
      if (firebaseMe && firebaseMe.loggedIn === false) {
        useStore.getState().logout();
        useStore.setState({ players });
        return;
      }
      // Protect current user's fresh login data from being overwritten
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
  });
  onSnapshot(marketsRef,  snap => { const markets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Market)); useStore.setState({ markets }); });
  onSnapshot(betsRef,     snap => { const bets    = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet));    useStore.setState({ bets }); });
  onSnapshot(answersRef,  snap => { const answers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Answer)); useStore.setState({ answers }); });
  onSnapshot(appStateRef, snap => { if (snap.exists()) useStore.setState({ jackpot: snap.data().jackpot ?? 0 }); });
};

export const resetToInitialState = async (initialPlayers: Player[], initialMarkets: Market[]) => {
  if (!db) return;
  const batch = writeBatch(db);

  // Clear all collections
  for (const colName of ['bets', 'markets', 'answers']) {
    const snap = await getDocs(collection(db, colName));
    snap.forEach(d => batch.delete(d.ref));
  }

  // Write initial players — completely overwrite each doc including loggedIn: false
  initialPlayers.forEach(p => {
    batch.set(doc(db, 'players', p.id), {
      ...p,
      avatar: '',
      avatarId: '',
      avatarColor: '',
      loggedIn: false,
    });
  });

  // Write initial markets (empty array = no docs written, which is fine)
  initialMarkets.forEach(m => batch.set(doc(db, 'markets', m.id), m));

  // Reset jackpot
  batch.set(doc(db, 'appState', 'global'), { jackpot: 0 });

  await batch.commit();
};