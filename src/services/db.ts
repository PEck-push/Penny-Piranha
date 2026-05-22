import { collection, doc, getDocs, onSnapshot, query, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer, FeedEvent } from '../store';

let syncInitialized = false;

export const initFirebaseSync = () => {
  if (!db || syncInitialized) return;
  syncInitialized = true;

  // ── LIVE-SYNC: Firebase → Zustand ────────────────────────────────────────────

  onSnapshot(collection(db, 'players'), snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    if (players.length === 0) return;
    useStore.setState({ players });
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
    if (snap.exists()) {
      const data = snap.data();
      useStore.setState({
        jackpot: data.jackpot ?? data.hausbank ?? 0,
        currentPhase: data.currentPhase ?? 'gruppenphase',
      });
    }
  }, err => console.error('[Firebase] appState Fehler:', err));

  // Feed: last 30 events, newest first
  const feedQ = query(collection(db, 'feed'), orderBy('ts', 'desc'), limit(30));
  onSnapshot(feedQ, snap => {
    const feed = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        ts: data.ts?.toMillis?.() ?? data.ts ?? 0,
      } as FeedEvent;
    });
    useStore.setState({ feed });
  }, err => console.error('[Firebase] feed Fehler:', err));
};

// ── RESET: Märkte und Wetten leeren (Admin-Panel) ─────────────────────────────
export const resetToInitialState = async (initialPlayers: Player[], initialMarkets: Market[]) => {
  if (!db) return;
  try {
    const batch = writeBatch(db);
    for (const colName of ['bets', 'markets', 'answers']) {
      const snap = await getDocs(collection(db, colName));
      snap.forEach(d => batch.delete(d.ref));
    }
    initialMarkets.forEach(m => batch.set(doc(db, 'markets', m.id), m));
    batch.set(doc(db, 'appState', 'global'), { jackpot: 0 });
    await batch.commit();
    console.log('[Firebase] Reset erfolgreich ✓');
    void initialPlayers; // kept for API compatibility
  } catch (err) {
    console.error('[Firebase] Reset Fehler:', err);
  }
};