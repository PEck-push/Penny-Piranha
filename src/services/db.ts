import { collection, doc, setDoc, getDocs, onSnapshot, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer } from '../store';

export const initFirebaseSync = () => {
  if (!db) {
    console.warn("Firebase not configured. Using local state.");
    return;
  }

  const playersRef = collection(db, 'players');
  const marketsRef = collection(db, 'markets');
  const betsRef = collection(db, 'bets');
  const answersRef = collection(db, 'answers'); // NEW
  const appStateRef = doc(db, 'appState', 'global');

  onSnapshot(playersRef, (snapshot) => {
    const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
    if (players.length > 0) useStore.setState({ players });
  });

  onSnapshot(marketsRef, (snapshot) => {
    const markets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Market));
    if (markets.length > 0) useStore.setState({ markets });
  });

  onSnapshot(betsRef, (snapshot) => {
    const bets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bet));
    useStore.setState({ bets });
  });

  // NEW: sync open-text answers
  onSnapshot(answersRef, (snapshot) => {
    const answers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Answer));
    useStore.setState({ answers });
  });

  onSnapshot(appStateRef, (doc) => {
    if (doc.exists()) {
      useStore.setState({ jackpot: doc.data().jackpot || 0 });
    }
  });
};

export const resetToInitialState = async (initialPlayers: Player[], initialMarkets: Market[]) => {
  if (!db) return;
  
  const playersRef = collection(db, 'players');
  const marketsRef = collection(db, 'markets');
  const betsRef = collection(db, 'bets');
  const answersRef = collection(db, 'answers');
  const appStateRef = doc(db, 'appState', 'global');

  const batch = writeBatch(db);

  const betsSnapshot = await getDocs(betsRef);
  betsSnapshot.forEach(doc => batch.delete(doc.ref));

  const marketsSnapshot = await getDocs(marketsRef);
  marketsSnapshot.forEach(doc => batch.delete(doc.ref));

  // NEW: delete all answers on reset
  const answersSnapshot = await getDocs(answersRef);
  answersSnapshot.forEach(doc => batch.delete(doc.ref));

  initialPlayers.forEach(player => {
    const ref = doc(playersRef, player.id);
    batch.set(ref, player);
  });

  initialMarkets.forEach(market => {
    const ref = doc(marketsRef, market.id);
    batch.set(ref, market);
  });

  // Reset jackpot to 0
  batch.set(appStateRef, { jackpot: 0 });

  await batch.commit();
};
