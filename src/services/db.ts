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

  // Firebase is the canonical truth; overwrite local state whenever it fires.
  onSnapshot(playersRef,  snap => { const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)); if (players.length > 0) useStore.setState({ players }); });
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