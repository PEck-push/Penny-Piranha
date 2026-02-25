import { collection, doc, setDoc, getDocs, onSnapshot, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet } from '../store';

export const initFirebaseSync = () => {
  if (!db) {
    console.warn("Firebase not configured. Using local state.");
    return;
  }

  // Collection references
  const playersRef = collection(db, 'players');
  const marketsRef = collection(db, 'markets');
  const betsRef = collection(db, 'bets');
  const appStateRef = doc(db, 'appState', 'global');

  // Listen to players
  onSnapshot(playersRef, (snapshot) => {
    const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
    if (players.length > 0) useStore.setState({ players });
  });

  // Listen to markets
  onSnapshot(marketsRef, (snapshot) => {
    const markets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Market));
    if (markets.length > 0) useStore.setState({ markets });
  });

  // Listen to bets
  onSnapshot(betsRef, (snapshot) => {
    const bets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bet));
    useStore.setState({ bets });
  });

  // Listen to global app state (jackpot)
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
  const appStateRef = doc(db, 'appState', 'global');

  const batch = writeBatch(db);

  // Delete all existing bets
  const betsSnapshot = await getDocs(betsRef);
  betsSnapshot.forEach(doc => batch.delete(doc.ref));

  // Delete all existing markets
  const marketsSnapshot = await getDocs(marketsRef);
  marketsSnapshot.forEach(doc => batch.delete(doc.ref));

  // Reset players
  initialPlayers.forEach(player => {
    const ref = doc(playersRef, player.id);
    batch.set(ref, player);
  });

  // Reset markets
  initialMarkets.forEach(market => {
    const ref = doc(marketsRef, market.id);
    batch.set(ref, market);
  });

  // Reset jackpot
  batch.set(appStateRef, { jackpot: 0 });

  await batch.commit();
};
