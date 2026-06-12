import { create } from 'zustand';
import { ACCESSORIES } from './data/accessories';
import { SHOP_EXAMPLE_ITEMS, SHOP_FIRST_ITEMS, SHOP_TORSO_ITEMS, shopUnlockAt, type ShopItem, type ShopSlot } from './data/shopItems';
import { db, auth } from './firebase';
import { doc, setDoc, updateDoc, writeBatch, collection, getDocs, deleteDoc, runTransaction, serverTimestamp, addDoc, arrayUnion, deleteField } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export type FeedEventType =
  | 'bet_placed' | 'market_resolved' | 'streak_on_fire' | 'streak_damn_hot'
  | 'badge_unlocked' | 'underdog_win' | 'phase_winner' | 'jackpot_distribution'
  | 'buyback' | 'market_locked' | 'shop_drop' | 'shop_purchase';

export interface FeedEvent {
  id: string;
  type: FeedEventType;
  playerId?: string;
  playerName?: string;
  marketId?: string;
  text: string;
  creditsChange?: number;
  ts: number; // Unix ms
}

export type Badge = 'MARKET MOVER' | 'THE WHALE' | 'BANKROTT' | 'STREAK';
export type ResolutionType = 'normal' | 'rollover' | 'storno' | 'no-winner' | 'all-same-side';

// WM 2026: Badge-IDs für PNG-Overlay-System (Achievements).
export type BadgeId =
  | 'on_fire'
  | 'damn_hot'
  | 'whale'
  | 'bankrupt'
  | 'phoenix'
  | 'underdog'
  | 'phasekoenig'
  | 'tageskoenig'
  | 'arschkarte'
  | 'wunderteam';

export const BADGE_LABELS: Record<BadgeId, string> = {
  on_fire:     'ON FIRE 🔥',
  damn_hot:    'DAMN HOT 🔥🔥',
  whale:       'THE WHALE 🐳',
  bankrupt:    'BANKROTT 💀',
  phoenix:     'PHOENIX 🦅',
  underdog:    'UNDERDOG-CHAMPION 💪',
  phasekoenig: 'PHASENKÖNIG 👑',
  tageskoenig: 'SPIELTAGSKÖNIG 🏆',
  arschkarte:  'ARSCHKARTE 🃏',
  wunderteam:  'WUNDERTEAM 🇦🇹',
};

export type StreakLevel = 'none' | 'on_fire' | 'damn_hot';

export interface MarketComboLeg {
  marketId: string;
  marketQuestion: string;
  predictedOptionId: string;
  predictedOptionLabel: string;
  status: 'pending' | 'hit' | 'miss';
}

export interface MarketOption {
  id: string;
  label: string;
  pool: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  avatarId: string;
  avatarColor: string;
  loggedIn: boolean;
  tokens: number;
  comboMalus: boolean;
  badges: Badge[];

  // ── WM 2026 (alle optional → bestehende Daten bleiben gültig) ──────────────
  firstName?: string;
  lastName?: string;
  email?: string;
  // Charakter (nach Registrierung gesperrt)
  headId?: string;
  bodyId?: string;
  characterLocked?: boolean;
  // PNG-Overlays
  unlockedOverlays?: string[];
  activeAccessoryId?: string | null;
  // Getragene Accessoires je Slot (rein kosmetisch). IDs aus data/accessories.ts.
  activeAccessories?: { head?: string | null; hand?: string | null; torso?: string | null };
  activeBadgeId?: BadgeId | null;
  // Shop: gekaufte Items (überleben Charakter-Reset) und aktuell getragene
  // Shop-Items je Slot. Werden auf EIGENEN z-Ebenen gerendert, parallel zu den
  // event-vergebenen Accessoires.
  shopInventory?: string[];
  activeShopItems?: { head?: string | null; hand?: string | null; torso?: string | null; effect?: string | null; background?: string | null };
  // Zeitpunkt des letzten Shop-Besuchs (für „Neu im Shop"-Punkt am Nav-Button).
  lastShopVisitTs?: number;
  // Credits / Buyback
  buybackUsed?: boolean;
  // Streak
  currentStreak?: number;
  bestStreak?: number;
  streakLevel?: StreakLevel;
  streakHistory?: { length: number; from: string; to: string }[];
  // Counter für Badges
  austriaSpecialCorrect?: number;
  underdogCorrect?: number;
  dailyNetGain?: number;
  // Reveal-Queue für nächtliche Ergebnisse
  unseenResolutions?: string[];
  // Test-Spieler (erfundene Mitspieler, nur im Testmodus) — beim Reset gelöscht
  isTestPlayer?: boolean;
  // Admin-Rolle (in Firestore per Hand oder über Admin-UI setzen)
  isAdmin?: boolean;
  // Freigabe-Status: neue Spieler sind 'pending' (approved=false) und müssen vom
  // Admin manuell freigegeben werden (nach erfolgter Einzahlung). Bestandsspieler
  // ohne Feld (undefined) gelten als freigegeben.
  approved?: boolean;
  // Test/Admin: erzwingt beim nächsten Aufruf eine neue Charakter-Erstellung.
  needsCharacter?: boolean;
  // Onboarding-Tour beim ersten Dashboard-Aufruf gezeigt? (false = noch zeigen)
  onboardingDone?: boolean;
}

export interface Market {
  id: string;
  question: string;
  type: 'standard' | 'hot-take' | 'anonymous' | 'combo';
  status: 'open' | 'locked' | 'resolved' | 'cancelled' | 'paused';
  options: MarketOption[];
  createdAt: number;
  expiresAt?: number;
  createdBy: string;
  winningOptionId?: string | null;
  resolutionType?: ResolutionType | null;
  isOpenQuestion?: boolean;
  comboLegs?: MarketComboLeg[];
  multiplier?: number;

  // ── WM 2026 Felder ────────────────────────────────────────────────────────────
  marketSubtype?: 'wm-match' | 'spezialwette' | 'milestone' | 'club-special' | 'jackpot';
  matchId?: string;            // verknüpft mit WmMatch.matchId aus wm2026Schedule.ts
  footballDataOrgId?: number;  // API-Spiel-ID (football-data.org) für auto-resolve
  teamA?: string;
  teamB?: string;
  kickoffAt?: number;          // UTC ms — wann Markt automatisch sperrt
  // Expliziter Annahmeschluss (UTC ms), v.a. für Gratis-/Jackpot-Wetten ohne
  // eigenen Anpfiff. Ist er gesetzt und erreicht, sperrt der Cron-Tick den Markt
  // automatisch (ohne Token-Abzug). Fehlt das Feld, schließt der Markt NICHT
  // automatisch — so bleiben neu angelegte Wetten unberührt. Über reopenMarket
  // (manuelles Öffnen) wird betCloseAt wieder entfernt.
  betCloseAt?: number;
  groupLabel?: string;
  minBet?: number;
  maxBet?: number;             // 0 = All-in (Finale)
  autoDeductAmount?: number;
  autoDeductProcessed?: boolean;
  initialSeedCredits?: number;
  lockedPoolSnapshot?: Record<string, number>;
  winningOptionIds?: string[]; // für Multi-Winner (Milestone etc.)
  austriaBlock?: boolean;      // Spezialwette gehört zum Österreich-Block
  comboGroupId?: string;       // Combo-Gruppe: alle Legs teilen dieselbe ID
  comboGroupLabel?: string;    // Obertitel der Combo-Gruppe
  // Jackpot-Sonderrunden (einsatzfrei, fester Haus-Preis)
  noStake?: boolean;           // true → Gratis-Tipp ohne Token-Einsatz
  jackpotBlock?: string;       // 'block1' | 'block2' | 'finale'
  jackpotBlockLabel?: string;  // z.B. "🏁 Ende Gruppenphase"
  fixedPrize?: number;         // fester Token-Preis dieser Frage (vom Haus)
  absorbsJackpotPot?: boolean; // Finale-Headline: schluckt angesparten jackpot
  allowMultiWinner?: boolean;  // mehrere Optionen koennen gleichzeitig richtig sein
                               // (z. B. Surprise-Out, wenn zwei Favoriten in derselben Runde rausfliegen)
  // Multiple-Choice: Spieler kreuzt mehrere Antworten an, gewinnt nur bei exakter
  // Übereinstimmung mit der vom Admin gewählten richtigen Menge. Der Tipp wird als
  // ein Bet gespeichert (optionId = kanonischer Schlüssel der Auswahl).
  multiSelect?: boolean;
  // Vom Resolve gesetzt (auto-resolve mit API-Score). Im Admin-Inspector & im
  // Feed zur Anzeige des End-Ergebnisses verwendet. `duration` = REGULAR |
  // EXTRA_TIME | PENALTY_SHOOTOUT (football-data.org).
  finalScore?: {
    home: number;
    away: number;
    duration?: string;
    penaltiesHome?: number;
    penaltiesAway?: number;
  };
  // Firestore-Timestamp serialisiert — kann beim Lesen als
  // { seconds, nanoseconds } oder mit toMillis() ankommen.
  resolvedAt?: unknown;
  resolvedBy?: 'auto' | 'admin';
}

export interface Bet {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;
  optionLabel: string;
  amount: number;
  timestamp: number;
  // Vom Resolve gesetzt: tatsächlich ausgezahlter Betrag (Parimutuel + Mindest-
  // garantie + Underdog-Bonus für Standard; Combo: amount×mult; Jackpot: gleich-
  // verteilt; Rollover: 50%; Storno: 100%). Streak-Boni hängen am Spieler und
  // zählen NICHT in payout. 0 = verloren. Fehlt = noch nicht aufgelöst.
  payout?: number;
}

export interface Answer {
  id: string;
  marketId: string;
  playerId: string;
  text: string;
  timestamp: number;
}

// WM 2026 Spielplan-Eintrag (aus Firestore `schedule`, befüllt via API-Import).
export interface ScheduleMatch {
  matchId: string;
  footballDataOrgId?: number;
  phase: string;
  groupLabel: string;
  teamA: string;
  teamB: string;
  kickoffAt: number; // UTC ms
  matchday?: number;
  status?: 'scheduled' | 'live' | 'finished';
  scoreA?: number | null;
  scoreB?: number | null;
  // Torschützen, falls die API sie liefert (football-data.org Free-Tier i.d.R. nicht).
  scorers?: { team?: string; player: string; minute?: number | null }[];
}

export const getMarketTotal = (m: Market) => m.options.reduce((s, o) => s + o.pool, 0);

// Kanonischer Schlüssel einer Multiple-Choice-Auswahl: sortierte Options-IDs,
// per '|' verbunden. Tipp und Auflösung erzeugen denselben Schlüssel, sodass
// „exakt richtig" über reinen String-Vergleich (b.optionId === winningOptionId)
// funktioniert.
export const buildSelectionKey = (ids: string[]) => [...ids].sort().join('|');

// ─── Cookie helpers (nur für currentUser Session) ─────────────────────────────
export const saveSessionCookie = (playerId: string, avatar: string, avatarColor: string) => {
  const v = encodeURIComponent(JSON.stringify({ playerId, avatar, avatarColor }));
  document.cookie = `betpanda_session=${v}; max-age=604800; path=/`;
};
export const readSessionCookie = () => {
  try {
    const m = document.cookie.split('; ').find(r => r.startsWith('betpanda_session='));
    if (!m) return null;
    return JSON.parse(decodeURIComponent(m.split('=')[1])) as { playerId: string; avatar: string; avatarColor: string };
  } catch { return null; }
};
export const clearSessionCookie = () => {
  document.cookie = 'betpanda_session=; max-age=0; path=/';
};

// ─── Initial Data ─────────────────────────────────────────────────────────────
// Initial leer — die Spielerliste kommt ausschließlich aus Firestore. Frühere
// Hardcoded-Testnamen (Alex/Neigi/…) führten dazu, dass eine leere players-
// Collection nach `go-live` die alten Test-Namen weiterhin in der Rangliste
// sichtbar gemacht hat.
export const INITIAL_PLAYERS: Player[] = [];
export const INITIAL_MARKETS: Market[] = [];

// Namen & Farben für erfundene Test-Spieler (Testmodus).
const TEST_NAMES = ['Bot-Kevin', 'Bot-Sandra', 'Bot-Hugo', 'Bot-Lena', 'Bot-Mario', 'Bot-Nina', 'Bot-Otto', 'Bot-Resi', 'Bot-Toni', 'Bot-Vera'];
const TEST_COLORS = ['#ff4500', '#00bfff', '#ffd700', '#32cd32', '#8b3dff', '#ff3d5a', '#00d68f'];

interface AppState {
  players: Player[];
  markets: Market[];
  bets: Bet[];
  answers: Answer[];
  feed: FeedEvent[];
  schedule: ScheduleMatch[];
  shopItems: ShopItem[]; // Katalog (Firestore: shopItems)
  shopLastDropTs: number; // Zeitstempel des letzten neuen Items (für Neu-Punkt)
  jackpot: number;
  currentPhase: string; // Phase string from appState/global
  testMode: boolean; // per Default true; via "Live gehen" deaktiviert
  adminMessage: string; // optionale Ticker-Nachricht des Admins
  whatsappGroupLink: string; // Beitrittslink zur WhatsApp-Gruppe (angezeigt nach Registrierung)
  exchangeRate: number; // Cashout-Wechselkurs: 100 TKN = X € (geteilt & persistiert)
  currentUser: string | null;
  // Firebase-Auth-Email des eingeloggten Users. Wird unabhängig vom Spieler-
  // Dokument geführt und dient als robuster Fallback für Admin-Checks
  // (falls das Firestore-Profil mal ohne Email-Feld angelegt wurde).
  currentEmail: string | null;

  login: (playerId: string, avatar: string, avatarColor: string, avatarId: string) => void;
  logout: () => void;
  setCurrentUser: (uid: string | null) => void;
  setCurrentEmail: (email: string | null) => void;
  registerPlayer: (uid: string, data: Omit<Player, 'id'>) => Promise<void>;
  logoutAuth: () => Promise<void>;
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => Promise<void>;
  placeBetAs: (playerId: string, marketId: string, optionId: string, optionLabel: string, amount: number) => Promise<void>;
  placeTip: (marketId: string, optionId: string, optionLabel: string) => Promise<void>;
  placeTipAs: (playerId: string, marketId: string, optionId: string, optionLabel: string) => Promise<void>;
  changeBet: (marketId: string, newOptionId: string, newOptionLabel: string, newAmount: number) => Promise<void>;
  changeTip: (marketId: string, newOptionId: string, newOptionLabel: string) => Promise<void>;
  closeMarket: (marketId: string) => Promise<void>;
  setPlayerAdmin: (playerId: string, isAdmin: boolean) => Promise<void>;
  setPlayerApproved: (playerId: string, approved: boolean) => Promise<void>;
  resetPlayerCharacter: (playerId: string) => Promise<void>;
  saveCharacter: (uid: string, fields: Partial<Pick<Player, 'headId' | 'bodyId' | 'avatar' | 'avatarId' | 'avatarColor'>>) => Promise<void>;
  setOnboardingDone: (done: boolean) => Promise<void>;
  deleteMarket: (marketId: string) => Promise<void>;
  createTestPlayer: (name?: string) => Promise<void>;
  autoBetTestPlayers: () => Promise<void>;
  submitAnswer: (marketId: string, text: string) => void;
  createMarket: (market: Omit<Market, 'id' | 'createdAt'>) => void;
  resolveOpenQuestion: (marketId: string, winnerPlayerIds: string[]) => void;
  resolveMarket: (marketId: string, winningOptionId: string) => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  pauseMarket: (marketId: string) => Promise<void>;
  reopenMarket: (marketId: string) => Promise<void>;
  // Annahmeschluss (UTC ms) setzen oder mit null entfernen.
  setMarketBetClose: (marketId: string, betCloseAt: number | null) => Promise<void>;
  // Bestehende WM-Märkte ohne footballDataOrgId nachträglich mit der API-ID aus
  // dem Spielplan verknüpfen (Voraussetzung für die automatische Auflösung).
  linkWmMarketsToApi: () => Promise<{ linked: number; unmatched: number }>;
  // Tagesgewinn (dailyNetGain) aller Spieler aus den aufgelösten Ergebnissen des
  // aktuellen US-Spieltags neu berechnen — repariert einen falschen Tagessieger.
  recomputeDailyGains: () => Promise<{ day: string | null; updated: number }>;
  giveTokens: (playerId: string, amount: number) => void;
  executeBuyback: (playerId: string) => Promise<void>;
  setAdminMessage: (msg: string) => Promise<void>;
  setWhatsappGroupLink: (url: string) => Promise<void>;
  setExchangeRate: (rate: number) => Promise<void>;
  setJackpot: (value: number) => Promise<void>;
  setActiveAccessory: (slot: 'head' | 'hand' | 'torso', accessoryId: string | null) => Promise<void>;
  grantAccessory: (playerId: string, accessoryId: string) => Promise<void>;
  awardBlockWinner: (block: string) => Promise<{ winners: string[] }>;
  simulateReveal: (net: number) => Promise<void>;
  // ─── Shop ───────────────────────────────────────────────────────────────────
  purchaseShopItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
  setActiveShopItem: (slot: ShopSlot, itemId: string | null) => Promise<void>;
  markShopVisited: () => Promise<void>;
  createShopItem: (data: Omit<ShopItem, 'createdAt'>) => Promise<void>;
  updateShopItem: (id: string, patch: Partial<ShopItem>) => Promise<void>;
  deleteShopItem: (id: string) => Promise<void>;
  seedShopExamples: () => Promise<{ added: number }>;
  seedShopFirstItems: () => Promise<{ added: number }>;
  seedShopTorsoItems: () => Promise<{ added: number }>;
  resetState: () => void;
}

// ─── Store OHNE zustand/persist ───────────────────────────────────────────────
// Das war der Hauptfehler: zustand/persist (localStorage) und Firebase haben
// sich gegenseitig überschrieben. Beim Refresh hat Firebase die leeren
// Collections zurückgeliefert und alles aus dem localStorage gelöscht.
// Jetzt: Firebase ist die einzige Wahrheit. Daten überleben jeden Refresh.
export const useStore = create<AppState>()((set, get) => {
  // ── Hinweis: Client-seitige Resolver wurden entfernt ────────────────────────
  // Die Auflösung lebt seit der Server-Migration ausschliesslich in der
  // Netlify-Function `/.netlify/functions/resolve-market` (Atomar via
  // `resolveInProgress`-Claim, identische Payout-Logik). Die unten verbliebenen
  // Stubs sind no-op + Warn-Log, falls noch irgendeine UI-Stelle sie aufruft —
  // sie sollen verhindern, dass eine doppelte Auszahlung passiert (Client +
  // Server gleichzeitig).

  return {
    players: INITIAL_PLAYERS,
    markets: [],
    bets: [],
    answers: [],
    feed: [],
    schedule: [],
    shopItems: [],
    shopLastDropTs: 0,
    jackpot: 0,
    currentPhase: 'gruppenphase',
    testMode: true,
    adminMessage: '',
    whatsappGroupLink: '',
    exchangeRate: 1,
    currentUser: null,
    currentEmail: null,

    login: async (playerId, avatar, avatarColor, avatarId) => {
      const player = get().players.find(p => p.id === playerId);
      set(s => ({
        currentUser: playerId,
        players: s.players.map(p =>
          p.id === playerId ? { ...p, avatar, avatarColor, avatarId, loggedIn: true } : p
        ),
      }));
      saveSessionCookie(playerId, avatar, avatarColor);
      if (db && player) {
        try {
          await setDoc(doc(db, 'players', playerId), {
            ...player, avatar, avatarColor, avatarId, loggedIn: true,
          });
        } catch (err) {
          console.error('[Store] login Fehler:', err);
        }
      }
    },

    logout: () => {
      clearSessionCookie();
      const userId = get().currentUser;
      set(s => ({
        currentUser: null,
        currentEmail: null,
        players: s.players.map(p =>
          p.id === userId ? { ...p, avatar: '', avatarId: '', avatarColor: '', loggedIn: false } : p
        ),
      }));
      if (db && userId) {
        updateDoc(doc(db, 'players', userId), { avatar: '', avatarId: '', avatarColor: '', loggedIn: false })
          .catch(err => console.error('[Store] logout Fehler:', err));
      }
    },

    placeBet: async (marketId, optionId, optionLabel, amount) => {
      const { currentUser, placeBetAs } = get();
      if (!currentUser) return;
      await placeBetAs(currentUser, marketId, optionId, optionLabel, amount);
    },

    // Platziert eine Wette im Namen eines beliebigen Spielers (für Test-Spieler
    // und das manuelle Befüllen von Pools im Admin-Panel). Geht jetzt durch den
    // Server-Endpunkt `/.netlify/functions/place-bet`, der atomar
    //   (a) Status/Anpfiff/Expires prüft,
    //   (b) Tokens dekrementiert,
    //   (c) Pool inkrementiert,
    //   (d) Bet-Doc anlegt
    // — verhindert Lost-Update bei parallelen Wetten und Selbst-Beschenken
    // via Devtools.
    placeBetAs: async (playerId, marketId, optionId, optionLabel, amount) => {
      const state = get();
      const player = state.players.find(p => p.id === playerId);
      if (!player) return;
      const mkt = state.markets.find(m => m.id === marketId);
      if (!mkt || mkt.status !== 'open') return;
      if (mkt.expiresAt && Date.now() > mkt.expiresAt) return;
      if (mkt.kickoffAt && Date.now() >= mkt.kickoffAt) return;
      const alreadyBet = state.bets.some(b => b.marketId === marketId && b.playerId === playerId);
      if (alreadyBet) return;
      if (amount > 0 && player.tokens < amount) return;

      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] placeBetAs: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/place-bet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketId, optionId, optionLabel, amount, playerId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] placeBetAs Server-Fehler:', data?.error ?? res.status);
          return;
        }
        // Optimistic local update — onSnapshot überschreibt das gleich mit Server-Truth.
        const betId = `${marketId}__${playerId}`;
        const bet: Bet = { id: betId, marketId, playerId, optionId, optionLabel, amount, timestamp: Date.now() };
        set(s => ({
          bets: [...s.bets.filter(b => b.id !== betId), bet],
          players: amount > 0
            ? s.players.map(p => p.id === playerId ? { ...p, tokens: p.tokens - amount } : p)
            : s.players,
          markets: amount > 0
            ? s.markets.map(m =>
                m.id === marketId
                  ? { ...m, options: m.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o) }
                  : m)
            : s.markets,
        }));
      } catch (err) {
        console.error('[Store] placeBetAs Fehler:', err);
      }
    },

    // Einsatzfreier Gratis-Tipp für Jackpot-Sonderrunden: nutzt denselben
    // Server-Endpunkt mit amount: 0 — kein Token-Abzug, kein Pool-Aufbau.
    placeTip: async (marketId, optionId, optionLabel) => {
      const { currentUser, placeTipAs } = get();
      if (!currentUser) return;
      await placeTipAs(currentUser, marketId, optionId, optionLabel);
    },

    placeTipAs: async (playerId, marketId, optionId, optionLabel) => {
      // Server-Endpoint kümmert sich um Status-/Doppel-Tipp-Check.
      const state = get();
      const mkt = state.markets.find(m => m.id === marketId);
      if (!mkt || mkt.status !== 'open') return;
      if (mkt.expiresAt && Date.now() > mkt.expiresAt) return;
      if (mkt.kickoffAt && Date.now() >= mkt.kickoffAt) return;
      const alreadyTipped = state.bets.some(b => b.marketId === marketId && b.playerId === playerId);
      if (alreadyTipped) return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] placeTipAs: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/place-bet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketId, optionId, optionLabel, amount: 0, playerId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] placeTipAs Server-Fehler:', data?.error ?? res.status);
          return;
        }
        const betId = `${marketId}__${playerId}`;
        const bet: Bet = { id: betId, marketId, playerId, optionId, optionLabel, amount: 0, timestamp: Date.now() };
        set(s => ({ bets: [...s.bets.filter(b => b.id !== betId), bet] }));
      } catch (err) {
        console.error('[Store] placeTipAs Fehler:', err);
      }
    },

    changeBet: async (marketId, newOptionId, newOptionLabel, newAmount) => {
      const state = get();
      const uid = state.currentUser;
      if (!uid) return;
      const oldBet = state.bets.find(b => b.marketId === marketId && b.playerId === uid);
      const player = state.players.find(p => p.id === uid);
      const market = state.markets.find(m => m.id === marketId);
      if (!oldBet || !player || !market || market.status !== 'open') return;
      if (market.expiresAt && Date.now() > market.expiresAt) return;
      if (market.kickoffAt && Date.now() >= market.kickoffAt) return;
      if (player.tokens + oldBet.amount < newAmount) return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] changeBet: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/change-bet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketId, newOptionId, newOptionLabel, newAmount }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] changeBet Server-Fehler:', data?.error ?? res.status);
          return;
        }
        const betId = `${marketId}__${uid}`;
        const newBet: Bet = { id: betId, marketId, playerId: uid, optionId: newOptionId, optionLabel: newOptionLabel, amount: newAmount, timestamp: Date.now() };
        set(s => ({
          bets: [...s.bets.filter(b => b.id !== oldBet.id && b.id !== betId), newBet],
          players: s.players.map(p => p.id === uid ? { ...p, tokens: p.tokens + oldBet.amount - newAmount } : p),
          markets: s.markets.map(m =>
            m.id === marketId
              ? {
                  ...m,
                  options: m.options.map(o => {
                    let pool = o.pool;
                    if (o.id === oldBet.optionId) pool -= oldBet.amount;
                    if (o.id === newOptionId)     pool += newAmount;
                    return { ...o, pool };
                  }),
                }
              : m),
        }));
      } catch (err) { console.error('[Store] changeBet Fehler:', err); }
    },

    changeTip: async (marketId, newOptionId, newOptionLabel) => {
      const state = get();
      const uid = state.currentUser;
      if (!uid) return;
      const oldBet = state.bets.find(b => b.marketId === marketId && b.playerId === uid);
      const market = state.markets.find(m => m.id === marketId);
      if (!oldBet || !market || market.status !== 'open') return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] changeTip: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/change-bet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketId, newOptionId, newOptionLabel, newAmount: 0 }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] changeTip Server-Fehler:', data?.error ?? res.status);
          return;
        }
        const betId = `${marketId}__${uid}`;
        const newBet: Bet = { id: betId, marketId, playerId: uid, optionId: newOptionId, optionLabel: newOptionLabel, amount: 0, timestamp: Date.now() };
        set(s => ({ bets: [...s.bets.filter(b => b.id !== oldBet.id && b.id !== betId), newBet] }));
      } catch (err) { console.error('[Store] changeTip Fehler:', err); }
    },

    closeMarket: async (marketId) => {
      const state = get();
      const market = state.markets.find(m => m.id === marketId);
      if (!market || (market.status !== 'open' && market.status !== 'locked')) return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] closeMarket: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/close-market', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] closeMarket Server-Fehler:', data?.error ?? res.status);
          return;
        }
      } catch (err) { console.error('[Store] closeMarket Fehler:', err); }
    },

    deleteMarket: async (marketId) => {
      set(s => ({ markets: s.markets.filter(m => m.id !== marketId) }));
      if (db) {
        try { await deleteDoc(doc(db, 'markets', marketId)); }
        catch (err) { console.error('[Store] deleteMarket Fehler:', err); }
      }
    },

    setPlayerAdmin: async (playerId, isAdmin) => {
      set(s => ({ players: s.players.map(p => p.id === playerId ? { ...p, isAdmin } : p) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'players', playerId), { isAdmin });
        } catch (err) { console.error('[Store] setPlayerAdmin Fehler:', err); }
      }
    },

    setPlayerApproved: async (playerId, approved) => {
      set(s => ({ players: s.players.map(p => p.id === playerId ? { ...p, approved } : p) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'players', playerId), { approved });
        } catch (err) { console.error('[Store] setPlayerApproved Fehler:', err); }
      }
    },

    // Test/Admin: Charakter eines Spielers zurücksetzen → erzwingt Neuerstellung.
    resetPlayerCharacter: async (playerId) => {
      const cleared = { headId: '', bodyId: '', avatar: '', avatarId: '', avatarColor: '', characterLocked: false, needsCharacter: true };
      set(s => ({ players: s.players.map(p => p.id === playerId ? { ...p, ...cleared } : p) }));
      if (db) {
        try { await updateDoc(doc(db, 'players', playerId), cleared); }
        catch (err) { console.error('[Store] resetPlayerCharacter Fehler:', err); }
      }
    },

    // Neuen Charakter des aktuellen Spielers speichern (beendet needsCharacter).
    saveCharacter: async (uid, fields) => {
      const upd = { ...fields, needsCharacter: false };
      set(s => ({ players: s.players.map(p => p.id === uid ? { ...p, ...upd } : p) }));
      if (db) {
        try { await updateDoc(doc(db, 'players', uid), upd); }
        catch (err) { console.error('[Store] saveCharacter Fehler:', err); }
      }
    },

    // Onboarding-Tour als gesehen markieren (oder zurücksetzen → erneut starten).
    setOnboardingDone: async (done) => {
      const uid = get().currentUser;
      if (!uid) return;
      set(s => ({ players: s.players.map(p => p.id === uid ? { ...p, onboardingDone: done } : p) }));
      if (db) {
        try { await updateDoc(doc(db, 'players', uid), { onboardingDone: done }); }
        catch (err) { console.error('[Store] setOnboardingDone Fehler:', err); }
      }
    },

    resolveOpenQuestion: async (marketId, winnerPlayerIds) => {
      console.warn('[Store] resolveOpenQuestion: client-side resolver removed — use server endpoint.', { marketId, winnerPlayerIds });
    },

    submitAnswer: async (marketId, text) => {
      const state = get();
      if (!state.currentUser) return;
      const answer: Answer = {
        id: crypto.randomUUID(),
        marketId, playerId: state.currentUser, text: text.trim(), timestamp: Date.now(),
      };
      set(s => ({ answers: [...s.answers, answer] }));
      if (db) {
        try {
          await setDoc(doc(db, 'answers', answer.id), answer);
        } catch (err) {
          console.error('[Store] submitAnswer Fehler:', err);
        }
      }
    },

    createMarket: async (marketData) => {
      const m: Market = {
        ...marketData, id: crypto.randomUUID(),
        createdAt: Date.now(), winningOptionId: null, resolutionType: null,
      };
      set(s => ({ markets: [...s.markets, m] }));
      if (db) {
        try {
          await setDoc(doc(db, 'markets', m.id), m);
        } catch (err) {
          console.error('[Store] createMarket Fehler:', err);
        }
      }
    },

    resolveMarket: async (marketId, winningOptionId) => {
      console.warn('[Store] resolveMarket: client-side resolver removed — use /.netlify/functions/resolve-market.', { marketId, winningOptionId });
    },

    resolveRollover: async (marketId) => {
      console.warn('[Store] resolveRollover: client-side resolver removed — use server endpoint.', { marketId });
    },

    resolveStorno: async (marketId) => {
      console.warn('[Store] resolveStorno: client-side resolver removed — use server endpoint.', { marketId });
    },

    lockMarket: async (marketId) => {
      set(s => ({ markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'locked' } : m) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'markets', marketId), { status: 'locked' });
        } catch (err) {
          console.error('[Store] lockMarket Fehler:', err);
        }
      }
    },

    // Pausieren: Markt für Spieler ausblenden (Status 'paused'), Einsätze & Pools
    // bleiben erhalten — keine Rückbuchung. Über reopenMarket wieder öffnen.
    pauseMarket: async (marketId) => {
      const m = get().markets.find(mk => mk.id === marketId);
      if (!m || (m.status !== 'open' && m.status !== 'locked')) return;
      set(s => ({ markets: s.markets.map(mk => mk.id === marketId ? { ...mk, status: 'paused' } : mk) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'markets', marketId), { status: 'paused' });
        } catch (err) {
          console.error('[Store] pauseMarket Fehler:', err);
        }
      }
    },

    // Wieder öffnen: pausierten oder gesperrten Markt zurück auf 'open' setzen.
    // Ein evtl. gesetzter Annahmeschluss (betCloseAt) wird dabei entfernt, damit
    // der Cron-Tick den Markt nicht sofort wieder sperrt — manuelles Öffnen ist
    // also das Sicherheitsventil gegen einen fehlerhaften Auto-Schluss.
    reopenMarket: async (marketId) => {
      const m = get().markets.find(mk => mk.id === marketId);
      if (!m || (m.status !== 'paused' && m.status !== 'locked')) return;
      set(s => ({ markets: s.markets.map(mk => mk.id === marketId ? { ...mk, status: 'open', betCloseAt: undefined } : mk) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'markets', marketId), { status: 'open', betCloseAt: deleteField() });
        } catch (err) {
          console.error('[Store] reopenMarket Fehler:', err);
        }
      }
    },

    // Annahmeschluss eines Marktes setzen (UTC ms) oder mit null entfernen. Bei
    // gesetztem Wert sperrt der Cron-Tick den Markt automatisch, sobald er
    // erreicht ist (ohne Token-Abzug) — gedacht v.a. für Gratis-/Jackpot-Wetten.
    setMarketBetClose: async (marketId, betCloseAt) => {
      set(s => ({ markets: s.markets.map(mk => mk.id === marketId ? { ...mk, betCloseAt: betCloseAt ?? undefined } : mk) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'markets', marketId), {
            betCloseAt: betCloseAt == null ? deleteField() : betCloseAt,
          });
        } catch (err) {
          console.error('[Store] setMarketBetClose Fehler:', err);
        }
      }
    },

    // Nachträgliches Verknüpfen: WM-Märkte, die ohne footballDataOrgId angelegt
    // wurden (z. B. via Admin-Massenfreigabe vor dem Fix), bekommen die API-ID aus
    // dem passenden Spielplan-Eintrag (gematcht über matchId). Erst danach kann
    // auto-resolve sie dem Ergebnis zuordnen und automatisch auflösen.
    linkWmMarketsToApi: async () => {
      const { markets, schedule } = get();
      const fdoByMatchId = new Map<string, number>();
      schedule.forEach(s => {
        if (typeof s.footballDataOrgId === 'number') fdoByMatchId.set(s.matchId, s.footballDataOrgId);
      });
      const updates: { id: string; fdoId: number }[] = [];
      let unmatched = 0;
      for (const m of markets) {
        if (m.marketSubtype !== 'wm-match') continue;
        if (typeof m.footballDataOrgId === 'number') continue; // bereits verknüpft
        const fdoId = m.matchId ? fdoByMatchId.get(m.matchId) : undefined;
        if (typeof fdoId === 'number') updates.push({ id: m.id, fdoId });
        else unmatched++;
      }
      if (updates.length > 0) {
        const byId = new Map(updates.map(u => [u.id, u.fdoId]));
        set(s => ({ markets: s.markets.map(m => byId.has(m.id) ? { ...m, footballDataOrgId: byId.get(m.id) } : m) }));
        if (db) {
          for (const u of updates) {
            try {
              await updateDoc(doc(db, 'markets', u.id), { footballDataOrgId: u.fdoId });
            } catch (err) {
              console.error('[Store] linkWmMarketsToApi Fehler:', err);
            }
          }
        }
      }
      return { linked: updates.length, unmatched };
    },

    // Repariert den Tagessieger: berechnet dailyNetGain aller Spieler aus den
    // bereits aufgelösten WM-Spielen des AKTUELLEN US-Spieltags neu (Anker
    // America/Los_Angeles — identisch zur Server-Logik in resolve.ts). Quelle
    // sind die persistierten payout-Felder der Bets (payout − Einsatz). Nötig,
    // weil ein Spieltag, der in Europa über zwei Kalendertage lief, den Reset
    // fälschlich mitten im Spieltag auslöste und Tageswerte gelöscht hat.
    recomputeDailyGains: async () => {
      const { markets, bets, players } = get();
      const usDayKey = (ms: number) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(ms));
      const resolvedWm = markets.filter(
        m => m.marketSubtype === 'wm-match' && m.status === 'resolved' && typeof m.kickoffAt === 'number',
      );
      if (resolvedWm.length === 0) return { day: null, updated: 0 };
      // Aktueller US-Spieltag = US-Tag des zuletzt angepfiffenen aufgelösten Spiels.
      const latest = Math.max(...resolvedWm.map(m => m.kickoffAt as number));
      const targetKey = usDayKey(latest);
      const todayIds = new Set(
        resolvedWm.filter(m => usDayKey(m.kickoffAt as number) === targetKey).map(m => m.id),
      );
      // Tages-Netto je Spieler aus den Bets dieser Spiele (payout − Einsatz).
      const gain: Record<string, number> = {};
      for (const b of bets) {
        if (!todayIds.has(b.marketId)) continue;
        gain[b.playerId] = (gain[b.playerId] ?? 0) + ((b.payout ?? 0) - (b.amount ?? 0));
      }
      // Alle Spieler schreiben (auch 0 — überschreibt Altwerte). Nur bei Differenz.
      let updated = 0;
      for (const p of players) {
        const net = Math.round(gain[p.id] ?? 0);
        if ((p.dailyNetGain ?? 0) === net) continue;
        set(s => ({ players: s.players.map(pl => pl.id === p.id ? { ...pl, dailyNetGain: net } : pl) }));
        if (db) {
          try {
            await updateDoc(doc(db, 'players', p.id), { dailyNetGain: net });
            updated++;
          } catch (err) {
            console.error('[Store] recomputeDailyGains Fehler:', err);
          }
        }
      }
      return { day: targetKey, updated };
    },

    giveTokens: async (playerId, amount) => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] giveTokens: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/admin-grant', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, tokens: amount }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] giveTokens Server-Fehler:', data?.error ?? res.status);
          return;
        }
        set(s => ({
          players: s.players.map(p => p.id === playerId ? { ...p, tokens: (p.tokens ?? 0) + amount } : p),
        }));
      } catch (err) {
        console.error('[Store] giveTokens Fehler:', err);
      }
    },

    executeBuyback: async (playerId) => {
      const state = get();
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.buybackUsed) return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] executeBuyback: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/buyback', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(playerId !== state.currentUser ? { playerId } : {}),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] executeBuyback Server-Fehler:', data?.error ?? res.status);
          return;
        }
        const data = await res.json();
        const newTokens = Number(data?.newTokens ?? (800 + (player.tokens ?? 0)));
        set(s => ({
          players: s.players.map(p => p.id === playerId ? { ...p, tokens: newTokens, buybackUsed: true } : p),
        }));
      } catch (err) {
        console.error('[Store] executeBuyback Fehler:', err);
      }
    },

    setAdminMessage: async (msg) => {
      set({ adminMessage: msg });
      if (db) await setDoc(doc(db, 'appState', 'global'), { adminMessage: msg }, { merge: true });
    },

    setExchangeRate: async (rate) => {
      const v = Math.max(0, Math.round(rate * 100) / 100); // auf 2 Nachkommastellen
      set({ exchangeRate: v });
      if (db) {
        try { await setDoc(doc(db, 'appState', 'global'), { exchangeRate: v }, { merge: true }); }
        catch (err) { console.error('[Store] setExchangeRate Fehler:', err); }
      }
    },

    setWhatsappGroupLink: async (url) => {
      set({ whatsappGroupLink: url });
      if (db) await setDoc(doc(db, 'appState', 'global'), { whatsappGroupLink: url }, { merge: true });
    },

    // Hausbank/Jackpot manuell auf einen exakten Wert setzen (Admin-Korrektur).
    setJackpot: async (value) => {
      const v = Math.max(0, Math.floor(value));
      set({ jackpot: v });
      if (db) {
        try {
          await setDoc(doc(db, 'appState', 'global'), { jackpot: v }, { merge: true });
        } catch (err) {
          console.error('[Store] setJackpot Fehler:', err);
        }
      }
    },

    // Test: setzt die Tagesbilanz des aktuellen Admins + markiert „ungesehen",
    // damit der Reveal-Screen beim nächsten Dashboard-Besuch abspielt.
    simulateReveal: async (net) => {
      const uid = get().currentUser;
      if (!uid) return;
      // arrayUnion statt direkter Überschreibung — sonst würde der Test-Reveal
      // echte ausstehende Resolutions des Admins überschreiben (und beim
      // Wegklicken mitlöschen). 'sim-reveal' wird vom RevealScreen sauber via
      // arrayRemove(...marketIds) wieder entfernt.
      const player = get().players.find(p => p.id === uid);
      const localUnseen = Array.from(new Set([...(player?.unseenResolutions ?? []), 'sim-reveal']));
      set(s => ({ players: s.players.map(p => p.id === uid ? { ...p, dailyNetGain: net, unseenResolutions: localUnseen } : p) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'players', uid), {
            dailyNetGain: net,
            unseenResolutions: arrayUnion('sim-reveal'),
          });
        } catch (err) { console.error('[Store] simulateReveal Fehler:', err); }
      }
    },

    // Accessoire eines Slots beim aktuellen Spieler an-/abwählen (rein kosmetisch).
    setActiveAccessory: async (slot, accessoryId) => {
      const uid = get().currentUser;
      if (!uid) return;
      set(s => ({
        players: s.players.map(p => p.id === uid
          ? { ...p, activeAccessories: { ...(p.activeAccessories ?? {}), [slot]: accessoryId } }
          : p),
      }));
      const p = get().players.find(pl => pl.id === uid);
      if (db && p) {
        try { await updateDoc(doc(db, 'players', uid), { activeAccessories: p.activeAccessories ?? {} }); }
        catch (err) { console.error('[Store] setActiveAccessory Fehler:', err); }
      }
    },

    // Accessoire freischalten (Auto-Vergabe oder Admin/Test).
    grantAccessory: async (playerId, accessoryId) => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) { console.warn('[Store] grantAccessory: kein Auth-Token.'); return; }
        const res = await fetch('/.netlify/functions/admin-grant', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, accessoryId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Store] grantAccessory Server-Fehler:', data?.error ?? res.status);
          return;
        }
        set(s => ({
          players: s.players.map(p => p.id === playerId
            ? { ...p, unlockedOverlays: Array.from(new Set([...(p.unlockedOverlays ?? []), accessoryId])) }
            : p),
        }));
      } catch (err) { console.error('[Store] grantAccessory Fehler:', err); }
    },

    // Block-Sieger küren: Spieler mit den meisten richtigen Tipps im jeweiligen
    // Gratis-Block erhalten alle Block-Preis-Accessoires (z.B. Österreich-Trikot).
    awardBlockWinner: async (block) => {
      const { markets, bets, players } = get();
      const prizeIds = ACCESSORIES.filter(a => a.block === block).map(a => a.id);
      if (prizeIds.length === 0) return { winners: [] };
      const blockMarkets = markets.filter(m =>
        m.marketSubtype === 'jackpot' && m.jackpotBlock === block &&
        m.status === 'resolved' && m.winningOptionId);
      const correct: Record<string, number> = {};
      for (const m of blockMarkets) {
        bets.filter(b => b.marketId === m.id && b.optionId === m.winningOptionId)
          .forEach(b => { correct[b.playerId] = (correct[b.playerId] || 0) + 1; });
      }
      const vals = Object.values(correct);
      const max = vals.length ? Math.max(...vals) : 0;
      if (max === 0) return { winners: [] };
      const winnerIds = Object.keys(correct).filter(pid => correct[pid] === max);
      for (const pid of winnerIds) {
        for (const aid of prizeIds) await get().grantAccessory(pid, aid);
      }
      return { winners: winnerIds.map(pid => players.find(p => p.id === pid)?.name ?? pid) };
    },

    // ── Shop: kaufen ─────────────────────────────────────────────────────────
    // Atomare Firestore-Transaktion: prüft Verfügbarkeit + Token-Stand, zieht
    // Preis ab und legt das Item ins Inventar. Doppelkäufe & negative Salden
    // sind dadurch ausgeschlossen.
    purchaseShopItem: async (itemId) => {
      const uid = get().currentUser;
      if (!uid) return { ok: false, error: 'Nicht eingeloggt.' };
      const item = get().shopItems.find(i => i.id === itemId);
      if (!item) return { ok: false, error: 'Item nicht gefunden.' };
      // Spielplan-Freischaltung clientseitig prüfen (sinnloser Server-Roundtrip
      // sonst). Server prüft availableFrom nochmal.
      const unlockAt = shopUnlockAt(item, get().schedule);
      if (unlockAt != null && unlockAt > Date.now()) {
        return { ok: false, error: item.unlockLabel ? `Freischaltung: ${item.unlockLabel}.` : 'Noch nicht freigeschaltet.' };
      }
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return { ok: false, error: 'Nicht authentifiziert.' };
        const res = await fetch('/.netlify/functions/purchase-shop-item', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data?.error ?? 'Kauf fehlgeschlagen.' };
        const cost = Number(data?.cost ?? item.price);
        // Optimistic local update — Server hat schon geschrieben, onSnapshot syncs gleich.
        set(s => ({
          players: s.players.map(p => p.id === uid
            ? { ...p, tokens: (p.tokens ?? 0) - cost, shopInventory: [...(p.shopInventory ?? []), itemId] }
            : p),
        }));
        return { ok: true };
      } catch (err: any) {
        console.error('[Store] purchaseShopItem Fehler:', err);
        return { ok: false, error: err?.message ?? 'Kauf fehlgeschlagen.' };
      }
    },

    // ── Shop: Item in einem Slot tragen/ablegen ─────────────────────────────
    setActiveShopItem: async (slot, itemId) => {
      const uid = get().currentUser;
      if (!uid) return;
      set(s => ({
        players: s.players.map(p => p.id === uid
          ? { ...p, activeShopItems: { ...(p.activeShopItems ?? {}), [slot]: itemId } }
          : p),
      }));
      const p = get().players.find(pl => pl.id === uid);
      if (db && p) {
        try { await updateDoc(doc(db, 'players', uid), { activeShopItems: p.activeShopItems ?? {} }); }
        catch (err) { console.error('[Store] setActiveShopItem Fehler:', err); }
      }
    },

    // ── Shop: „besucht"-Zeitstempel setzen (löscht den Neu-Punkt) ───────────
    markShopVisited: async () => {
      const uid = get().currentUser;
      if (!uid) return;
      const ts = Date.now();
      set(s => ({ players: s.players.map(p => p.id === uid ? { ...p, lastShopVisitTs: ts } : p) }));
      if (db) {
        try { await updateDoc(doc(db, 'players', uid), { lastShopVisitTs: ts }); }
        catch (err) { console.error('[Store] markShopVisited Fehler:', err); }
      }
    },

    // ── Shop: Item anlegen (Admin) ──────────────────────────────────────────
    // Schreibt das Item, aktualisiert appState.shopLastDropTs und legt einen
    // Feed-Eintrag an, damit alle Spieler informiert werden.
    createShopItem: async (data) => {
      if (!db) return;
      const now = Date.now();
      const payload: ShopItem = { ...data, createdAt: now };
      try {
        await setDoc(doc(db, 'shopItems', data.id), payload);
        await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
        await addDoc(collection(db, 'feed'), {
          type: 'shop_drop',
          text: `Neu im Shop: „${data.label}" 🛒`,
          ts: serverTimestamp(),
        });
      } catch (err) {
        console.error('[Store] createShopItem Fehler:', err);
      }
    },

    updateShopItem: async (id, patch) => {
      if (!db) return;
      try { await updateDoc(doc(db, 'shopItems', id), patch as any); }
      catch (err) { console.error('[Store] updateShopItem Fehler:', err); }
    },

    deleteShopItem: async (id) => {
      if (!db) return;
      try { await deleteDoc(doc(db, 'shopItems', id)); }
      catch (err) { console.error('[Store] deleteShopItem Fehler:', err); }
    },

    // ── Shop: Beispiel-Items anlegen (einmaliger Seed) ──────────────────────
    seedShopExamples: async () => {
      if (!db) return { added: 0 };
      const existing = new Set(get().shopItems.map(i => i.id));
      const now = Date.now();
      let added = 0;
      try {
        for (const ex of SHOP_EXAMPLE_ITEMS) {
          if (existing.has(ex.id)) continue;
          await setDoc(doc(db, 'shopItems', ex.id), { ...ex, createdAt: now });
          added++;
        }
        if (added > 0) {
          await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
        }
      } catch (err) {
        console.error('[Store] seedShopExamples Fehler:', err);
      }
      return { added };
    },

    // ── Shop: erste echte Item-Charge anlegen (Schwechi, …) ──────────────────
    // Additive: NUR neue Items werden angelegt. Bereits existierende Items
    // bleiben UNANGETASTET (Preis, Beschreibung, unlockRule, sold etc. —
    // alles vom Admin editierte ueberlebt).
    seedShopFirstItems: async () => {
      if (!db) return { added: 0 };
      const existing = new Map(get().shopItems.map(i => [i.id, i]));
      const now = Date.now();
      let added = 0;
      try {
        for (const it of SHOP_FIRST_ITEMS) {
          if (existing.has(it.id)) continue; // existierendes Item nicht ueberschreiben
          await setDoc(doc(db, 'shopItems', it.id), { ...it, createdAt: now });
          added++;
        }
        if (added > 0) {
          await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
        }
      } catch (err) {
        console.error('[Store] seedShopFirstItems Fehler:', err);
      }
      return { added };
    },

    // ── Shop: Trikot-Items anlegen (asv_retro, kapitn_zrce, ferko) ───────────
    // Gleiche additive Logik: neue Items werden gesetzt, bereits vorhandene
    // bleiben unangetastet.
    seedShopTorsoItems: async () => {
      if (!db) return { added: 0 };
      const existing = new Map(get().shopItems.map(i => [i.id, i]));
      const now = Date.now();
      let added = 0;
      try {
        for (const it of SHOP_TORSO_ITEMS) {
          if (existing.has(it.id)) continue; // existierendes Item nicht ueberschreiben
          await setDoc(doc(db, 'shopItems', it.id), { ...it, createdAt: now });
          added++;
        }
        if (added > 0) {
          await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
        }
      } catch (err) {
        console.error('[Store] seedShopTorsoItems Fehler:', err);
      }
      return { added };
    },

    resetState: () => {
      clearSessionCookie();
      set({ players: INITIAL_PLAYERS, markets: [], bets: [], answers: [], feed: [], schedule: [], shopItems: [], shopLastDropTs: 0, jackpot: 0, currentPhase: 'gruppenphase', testMode: true, adminMessage: '', currentUser: null });
    },

    // Erfundener Mitspieler (nur Testmodus). Wird in Firestore gespeichert, damit
    // er bei Wetten/Pools/Auflösung wie ein echter Spieler mitzählt.
    createTestPlayer: async (name) => {
      const id = `test-${crypto.randomUUID()}`;
      const finalName = name?.trim() || `${TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)]} ${Math.floor(Math.random() * 90 + 10)}`;
      const color = TEST_COLORS[Math.floor(Math.random() * TEST_COLORS.length)];
      const player: Player = {
        id, name: finalName, avatar: '', avatarId: '', avatarColor: color,
        loggedIn: false, tokens: 1000, comboMalus: false, badges: [],
        currentStreak: 0, bestStreak: 0, streakLevel: 'none', isTestPlayer: true,
      };
      set(s => ({ players: [...s.players, player] }));
      if (db) {
        try {
          await setDoc(doc(db, 'players', id), player);
        } catch (err) {
          console.error('[Store] createTestPlayer Fehler:', err);
        }
      }
    },

    // Verteilt für alle Test-Spieler zufällige Wetten/Tipps auf offene Märkte,
    // die sie noch nicht getippt haben. Füllt Pools für realistische Tests.
    autoBetTestPlayers: async () => {
      const { players, markets } = get();
      const testPlayers = players.filter(p => p.isTestPlayer);
      const openMarkets = markets.filter(m => m.status === 'open');
      for (const tp of testPlayers) {
        for (const m of openMarkets) {
          if (m.expiresAt && Date.now() > m.expiresAt) continue;
          if (!m.options.length) continue;
          const opt = m.options[Math.floor(Math.random() * m.options.length)];
          if (m.marketSubtype === 'jackpot' || m.noStake) {
            await get().placeTipAs(tp.id, m.id, opt.id, opt.label);
          } else {
            const amount = Math.floor(Math.random() * 5 + 1) * 20; // 20–100 TKN
            await get().placeBetAs(tp.id, m.id, opt.id, opt.label, amount);
          }
        }
      }
    },

    setCurrentUser: (uid) => set({ currentUser: uid }),
    setCurrentEmail: (email) => set({ currentEmail: email }),

    registerPlayer: async (uid, data) => {
      const player: Player = { id: uid, ...data };
      set(s => ({
        players: [...s.players.filter(p => p.id !== uid), player],
        currentUser: uid,
      }));
      if (db) {
        // Fehler MÜSSEN hochbubbeln — sonst denkt Register.tsx, alles ist gut
        // und der User landet profil-los im Dashboard ("Spielerprofil nicht
        // gefunden"). Bei PERMISSION_DENIED durch Rules muss der User es
        // sehen, damit wir Probleme erkennen.
        await setDoc(doc(db, 'players', uid), { id: uid, ...data });
      }
    },

    logoutAuth: async () => {
      set({ currentUser: null });
      try {
        await signOut(auth);
      } catch (err) {
        console.error('[Store] logoutAuth Fehler:', err);
      }
    },
  };
});