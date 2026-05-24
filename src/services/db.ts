import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer, FeedEvent, ScheduleMatch } from '../store';

let syncInitialized = false;
let unsubscribers: (() => void)[] = [];

export const teardownFirebaseSync = () => {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];
  syncInitialized = false;
};

export const initFirebaseSync = () => {
  if (!db || syncInitialized) return;
  syncInitialized = true;

  const sub = (unsub: () => void) => unsubscribers.push(unsub);

  // ── LIVE-SYNC: Firebase → Zustand ────────────────────────────────────────────

  sub(onSnapshot(collection(db, 'players'), snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    if (players.length === 0) return;
    useStore.setState({ players });
  }, err => console.error('[Firebase] players Fehler:', err)));

  sub(onSnapshot(collection(db, 'markets'), snap => {
    const markets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Market));
    useStore.setState({ markets });
  }, err => console.error('[Firebase] markets Fehler:', err)));

  sub(onSnapshot(collection(db, 'bets'), snap => {
    const bets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet));
    useStore.setState({ bets });
  }, err => console.error('[Firebase] bets Fehler:', err)));

  sub(onSnapshot(collection(db, 'answers'), snap => {
    const answers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Answer));
    useStore.setState({ answers });
  }, err => console.error('[Firebase] answers Fehler:', err)));

  sub(onSnapshot(doc(db, 'appState', 'global'), snap => {
    if (snap.exists()) {
      const data = snap.data();
      useStore.setState({
        jackpot: data.jackpot ?? data.hausbank ?? 0,
        currentPhase: data.currentPhase ?? 'gruppenphase',
        testMode: data.testMode ?? true,
      });
    }
  }, err => console.error('[Firebase] appState Fehler:', err)));

  const feedQ = query(collection(db, 'feed'), orderBy('ts', 'desc'), limit(30));
  sub(onSnapshot(feedQ, snap => {
    const feed = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, ts: data.ts?.toMillis?.() ?? data.ts ?? 0 } as FeedEvent;
    });
    useStore.setState({ feed });
  }, err => console.error('[Firebase] feed Fehler:', err)));

  sub(onSnapshot(collection(db, 'schedule'), snap => {
    const schedule = snap.docs.map(d => ({ matchId: d.id, ...d.data() } as ScheduleMatch));
    useStore.setState({ schedule });
  }, err => console.error('[Firebase] schedule Fehler:', err)));
};
