import { collection, doc, onSnapshot, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useStore, Player, Market, Bet, Answer, FeedEvent, ScheduleMatch } from '../store';
import { withShopPresentation, type ShopItem } from '../data/shopItems';
import { deName } from '../utils/teams';

// WM-Match-Märkte können mit englischen API-Teamnamen (football-data.org) in
// Firestore liegen — etwa weil der Server-Auto-Open sie so angelegt hat. Beim
// Einlesen zentral auf deutsche Anzeigenamen übersetzen, damit ALLE Menüs
// (Dashboard, Meine Wetten, Spielplan, Combos …) deutsche Namen zeigen.
// Idempotent: bereits deutsche Namen bleiben unverändert.
const normalizeMarketTeams = (m: Market): Market => {
  if (m.marketSubtype !== 'wm-match') return m;
  const a = m.teamA ? deName(m.teamA) : m.teamA;
  const b = m.teamB ? deName(m.teamB) : m.teamB;
  const options = Array.isArray(m.options)
    ? m.options.map(o =>
        o.id === 'home' && a ? { ...o, label: a }
        : o.id === 'away' && b ? { ...o, label: b }
        : o)
    : m.options;
  return {
    ...m,
    teamA: a,
    teamB: b,
    question: a && b ? `${a} vs. ${b}` : m.question,
    options,
  };
};

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
    // Leeres Resultat IST eine valide Information (z. B. direkt nach go-live):
    // dann sollen auch die letzten Player-Daten aus dem State verschwinden.
    useStore.setState({ players });
  }, err => console.error('[Firebase] players Fehler:', err)));

  sub(onSnapshot(collection(db, 'markets'), snap => {
    const markets = snap.docs.map(d => normalizeMarketTeams({ id: d.id, ...d.data() } as Market));
    useStore.setState({ markets });
  }, err => console.error('[Firebase] markets Fehler:', err)));

  // READ-OPTIMIERUNG: nur noch AKTIVE Tipps (active == true → Markt offen/gesperrt)
  // live streamen. Ausgewertete Tipps (active == false) wachsen übers Turnier
  // unbegrenzt und werden NICHT mehr an jeden Client gestreamt — sie werden bei
  // Bedarf gezielt nachgeladen (store.loadHistoryBets: eigene Historie nach Login,
  // fremde Profile/Admin on demand). Dadurch hört die Lesemenge auf zu wachsen.
  sub(onSnapshot(query(collection(db, 'bets'), where('active', '==', true)), snap => {
    // optionLabel wird beim Tippen gespeichert und kann bei Alt-Wetten englisch
    // sein (z. B. Heim/Auswärts-Team). deName ist idempotent — deutsche Labels
    // und Nicht-Team-Optionen (JA/NEIN, Unentschieden) bleiben unverändert.
    const bets = snap.docs.map(d => {
      const b = { id: d.id, ...d.data() } as Bet;
      return b.optionLabel ? { ...b, optionLabel: deName(b.optionLabel) } : b;
    });
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
        hideOthersBets: data.hideOthersBets ?? false,
        adminMessage: data.adminMessage ?? '',
        whatsappGroupLink: data.whatsappGroupLink ?? '',
        exchangeRate: data.exchangeRate ?? 1,
        shopLastDropTs: data.shopLastDropTs ?? 0,
      });
    }
  }, err => console.error('[Firebase] appState Fehler:', err)));

  sub(onSnapshot(collection(db, 'shopItems'), snap => {
    const shopItems = snap.docs.map(d => withShopPresentation({ id: d.id, ...d.data() } as ShopItem));
    useStore.setState({ shopItems });
  }, err => console.error('[Firebase] shopItems Fehler:', err)));

  const feedQ = query(collection(db, 'feed'), orderBy('ts', 'desc'), limit(30));
  sub(onSnapshot(feedQ, snap => {
    const feed = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, ts: data.ts?.toMillis?.() ?? data.ts ?? 0 } as FeedEvent;
    });
    useStore.setState({ feed });
  }, err => console.error('[Firebase] feed Fehler:', err)));

  // Schedule ändert sich nur beim Admin-Import → einmalig laden statt Live-Listener.
  // Spart bei jedem App-Start/Reload die Reads für ~100 Spielplan-Dokumente und
  // vermeidet das Live-Echo. Nach einem Spielplan-Import müssen offene Clients
  // einmal neu laden, um die neuen Spiele zu sehen.
  getDocs(collection(db, 'schedule'))
    .then(snap => {
      const schedule = snap.docs.map(d => ({ matchId: d.id, ...d.data() } as ScheduleMatch));
      useStore.setState({ schedule });
    })
    .catch(err => console.error('[Firebase] schedule Fehler:', err));
};
