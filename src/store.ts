import { create } from 'zustand';
import { ACCESSORIES } from './data/accessories';
import { SHOP_EXAMPLE_ITEMS, SHOP_FIRST_ITEMS, SHOP_TORSO_ITEMS, shopUnlockAt, type ShopItem, type ShopSlot } from './data/shopItems';
import { calcWinnerPayout } from './utils/credits';
import { db, auth } from './firebase';
import { doc, setDoc, updateDoc, writeBatch, collection, getDocs, deleteDoc, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore';
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
  teamA?: string;
  teamB?: string;
  kickoffAt?: number;          // UTC ms — wann Markt automatisch sperrt
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
export const INITIAL_PLAYERS: Player[] = [
  { id: 'p1',  name: 'Alex',    avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p2',  name: 'Neigi',   avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p3',  name: 'Michi',   avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p4',  name: 'Steindl', avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p5',  name: 'Paco',    avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p6',  name: 'Luigi',   avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p7',  name: 'Stefan',  avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p8',  name: 'Jakob',   avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p9',  name: 'Philipp', avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p10', name: 'Memo',    avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p11', name: 'Moz',     avatar: '', avatarId: '', avatarColor: '', loggedIn: false, tokens: 1000, comboMalus: false, badges: [] },
];
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
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => void;
  placeBetAs: (playerId: string, marketId: string, optionId: string, optionLabel: string, amount: number) => Promise<void>;
  placeTip: (marketId: string, optionId: string, optionLabel: string) => void;
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
  fullReset: () => Promise<void>;
  submitAnswer: (marketId: string, text: string) => void;
  createMarket: (market: Omit<Market, 'id' | 'createdAt'>) => void;
  resolveOpenQuestion: (marketId: string, winnerPlayerIds: string[]) => void;
  resolveMarket: (marketId: string, winningOptionId: string) => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  pauseMarket: (marketId: string) => Promise<void>;
  reopenMarket: (marketId: string) => Promise<void>;
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
  const resolveMarket = async (marketId: string, winningOptionId: string) => {
    const state = get();
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved' || market.status === 'cancelled') return;

    const winOpt = market.options.find(o => o.id === winningOptionId);
    const totalPool = getMarketTotal(market);
    const winPool = winOpt?.pool ?? 0;
    const allBets = state.bets.filter(b => b.marketId === marketId);
    const winBets = allBets.filter(b => b.optionId === winningOptionId);
    const pUpdates: Record<string, number> = {};
    let newJackpot = state.jackpot;
    let resType: ResolutionType;

    if (market.marketSubtype === 'jackpot') {
      // Einsatzfreie Sonderrunde: fester Haus-Preis, gleichmäßig auf richtige
      // Tipper verteilt. Die Finale-Headline absorbiert zusätzlich den
      // angesparten jackpot. Unbeanspruchte/Rest-Token rollen in den jackpot.
      resType = 'normal';
      const prize = (market.fixedPrize ?? 0) + (market.absorbsJackpotPot ? state.jackpot : 0);
      const n = winBets.length;
      let paid = 0;
      if (n > 0) {
        const each = Math.floor(prize / n);
        winBets.forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + each; paid += each; });
      }
      newJackpot = (market.absorbsJackpotPot ? 0 : state.jackpot) + prize - paid;
    } else if (market.type === 'combo') {
      const multiplier = market.multiplier ?? 3;
      if (winningOptionId === 'combo-win') {
        resType = 'normal';
        const winnerBets = allBets.filter(b => b.optionId === 'combo-win');
        let totalPayout = 0;
        winnerBets.forEach(b => {
          const payout = b.amount * multiplier;
          pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + payout;
          totalPayout += payout;
        });
        newJackpot = Math.max(0, state.jackpot - Math.max(0, totalPayout - totalPool));
      } else {
        resType = 'no-winner';
        newJackpot = state.jackpot + totalPool;
      }
    } else if (market.multiSelect) {
      // Einsatz-Multiple-Choice: Pools je Option sind hier leer (der Einsatz hängt
      // an der Kombination). Parimutuel über die Summe ALLER Einsätze; nur exakt
      // passende Tipps (b.optionId === winningOptionId) teilen den Topf anteilig.
      const totalStake = allBets.reduce((s, b) => s + b.amount, 0);
      const winStake = winBets.reduce((s, b) => s + b.amount, 0);
      if (winStake === 0) {
        resType = 'no-winner';
        let refunded = 0;
        allBets.forEach(b => { const r = Math.floor(b.amount * 0.5); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + r; refunded += r; });
        newJackpot = state.jackpot + (totalStake - refunded);
      } else {
        // Multi-Select-Parimutuel + Mindestgarantie (calcWinnerPayout = Server-konform).
        resType = 'normal';
        let paid = 0;
        winBets.forEach(b => {
          const final = calcWinnerPayout(b.amount, winStake, totalStake);
          pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + final;
          paid += final;
        });
        newJackpot = Math.max(0, state.jackpot + (totalStake - paid));
      }
    } else if (!winOpt || winPool === 0) {
      resType = 'no-winner';
      let refunded = 0;
      allBets.forEach(b => { const r = Math.floor(b.amount * 0.5); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + r; refunded += r; });
      newJackpot = state.jackpot + (totalPool - refunded);
    } else if (winPool === totalPool) {
      // Alle auf derselben Seite: reine Rückzahlung des Einsatzes (kein Gewinn,
      // also auch keine Mindestgarantie aus dem Jackpot).
      resType = 'all-same-side';
      winBets.forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
    } else {
      // Parimutuel + Mindestgarantie über calcWinnerPayout — identische Math wie
      // Server (MIN_WIN_BONUS=2, Math.round). Negativer Jackpot wird auf 0 begrenzt.
      resType = 'normal';
      const eff = totalPool;
      let paid = 0;
      winBets.forEach(b => {
        const final = calcWinnerPayout(b.amount, winPool, eff);
        pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + final;
        paid += final;
      });
      newJackpot = Math.max(0, state.jackpot + (eff - paid));
    }

    set(s => ({
      jackpot: newJackpot,
      markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId, resolutionType: resType } : m),
      players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
    }));

    if (db) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId, resolutionType: resType });
        batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
        Object.entries(pUpdates).forEach(([pid, amt]) => {
          const p = state.players.find(pl => pl.id === pid);
          if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
        });
        await batch.commit();
      } catch (err) {
        console.error('[Store] resolveMarket Fehler:', err);
      }
    }

    if (market.type !== 'combo') {
      const freshState = get();
      const affectedCombos = freshState.markets.filter(
        m => m.type === 'combo' &&
        (m.status === 'open' || m.status === 'locked') &&
        m.comboLegs?.some(l => l.marketId === marketId)
      );
      for (const combo of affectedCombos) {
        const updatedLegs: MarketComboLeg[] = (combo.comboLegs ?? []).map(leg =>
          leg.marketId === marketId
            ? { ...leg, status: leg.predictedOptionId === winningOptionId ? 'hit' : 'miss' }
            : leg
        );
        set(s => ({ markets: s.markets.map(m => m.id === combo.id ? { ...m, comboLegs: updatedLegs } : m) }));
        if (db) {
          try {
            await updateDoc(doc(db, 'markets', combo.id), { comboLegs: updatedLegs });
          } catch (err) {
            console.error('[Store] Combo-Legs Fehler:', err);
          }
        }
        if (updatedLegs.some(l => l.status === 'miss')) await resolveMarket(combo.id, 'combo-miss');
        else if (updatedLegs.every(l => l.status === 'hit')) await resolveMarket(combo.id, 'combo-win');
      }
    }
  };

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
    // und das manuelle Befüllen von Pools im Admin-Panel).
    placeBetAs: async (playerId, marketId, optionId, optionLabel, amount) => {
      const state = get();
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.tokens < amount) return;
      const mkt = state.markets.find(m => m.id === marketId);
      if (mkt?.expiresAt && Date.now() > mkt.expiresAt) return;
      // Wett-Schluss bei Anpfiff: auch wenn der Server-Lock (Cron) erst später greift.
      if (mkt?.kickoffAt && Date.now() >= mkt.kickoffAt) return;
      const alreadyBet = state.bets.some(b => b.marketId === marketId && b.playerId === playerId);
      if (alreadyBet) return;

      const bet: Bet = {
        id: crypto.randomUUID(),
        marketId, playerId, optionId, optionLabel, amount,
        timestamp: Date.now(),
      };
      set(s => ({
        bets: [...s.bets, bet],
        players: s.players.map(p => p.id === playerId ? { ...p, tokens: p.tokens - amount } : p),
        markets: s.markets.map(m =>
          m.id === marketId
            ? { ...m, options: m.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o) }
            : m
        ),
      }));
      if (db) {
        try {
          const updatedMkt = get().markets.find(m => m.id === marketId);
          const batch = writeBatch(db);
          batch.set(doc(db, 'bets', bet.id), bet);
          batch.update(doc(db, 'players', playerId), { tokens: player.tokens - amount });
          if (updatedMkt) batch.update(doc(db, 'markets', marketId), { options: updatedMkt.options });
          await batch.commit();
        } catch (err) {
          console.error('[Store] placeBetAs Fehler:', err);
        }
      }
    },

    // Einsatzfreier Gratis-Tipp für Jackpot-Sonderrunden: kein Token-Abzug,
    // kein Pool-Aufbau — wird als Bet mit amount: 0 gespeichert.
    placeTip: async (marketId, optionId, optionLabel) => {
      const { currentUser, placeTipAs } = get();
      if (!currentUser) return;
      await placeTipAs(currentUser, marketId, optionId, optionLabel);
    },

    placeTipAs: async (playerId, marketId, optionId, optionLabel) => {
      const state = get();
      const mkt = state.markets.find(m => m.id === marketId);
      if (mkt?.expiresAt && Date.now() > mkt.expiresAt) return;
      const alreadyTipped = state.bets.some(b => b.marketId === marketId && b.playerId === playerId);
      if (alreadyTipped) return;

      const bet: Bet = {
        id: crypto.randomUUID(),
        marketId, playerId, optionId, optionLabel, amount: 0,
        timestamp: Date.now(),
      };
      set(s => ({ bets: [...s.bets, bet] }));
      if (db) {
        try {
          await setDoc(doc(db, 'bets', bet.id), bet);
        } catch (err) {
          console.error('[Store] placeTipAs Fehler:', err);
        }
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
      const newBet: Bet = { id: crypto.randomUUID(), marketId, playerId: uid, optionId: newOptionId, optionLabel: newOptionLabel, amount: newAmount, timestamp: Date.now() };
      set(s => ({
        bets: [...s.bets.filter(b => b.id !== oldBet.id), newBet],
        players: s.players.map(p => p.id === uid ? { ...p, tokens: p.tokens + oldBet.amount - newAmount } : p),
        markets: s.markets.map(m => m.id === marketId ? { ...m, options: m.options.map(o => o.id === oldBet.optionId ? { ...o, pool: o.pool - oldBet.amount } : o.id === newOptionId ? { ...o, pool: o.pool + newAmount } : o) } : m),
      }));
      if (db) {
        try {
          const updatedMkt = get().markets.find(m => m.id === marketId);
          const batch = writeBatch(db);
          batch.delete(doc(db, 'bets', oldBet.id));
          batch.set(doc(db, 'bets', newBet.id), newBet);
          batch.update(doc(db, 'players', uid), { tokens: player.tokens + oldBet.amount - newAmount });
          if (updatedMkt) batch.update(doc(db, 'markets', marketId), { options: updatedMkt.options });
          await batch.commit();
        } catch (err) { console.error('[Store] changeBet Fehler:', err); }
      }
    },

    changeTip: async (marketId, newOptionId, newOptionLabel) => {
      const state = get();
      const uid = state.currentUser;
      if (!uid) return;
      const oldBet = state.bets.find(b => b.marketId === marketId && b.playerId === uid);
      const market = state.markets.find(m => m.id === marketId);
      if (!oldBet || !market || market.status !== 'open') return;
      const newBet: Bet = { id: crypto.randomUUID(), marketId, playerId: uid, optionId: newOptionId, optionLabel: newOptionLabel, amount: 0, timestamp: Date.now() };
      set(s => ({ bets: [...s.bets.filter(b => b.id !== oldBet.id), newBet] }));
      if (db) {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'bets', oldBet.id));
          batch.set(doc(db, 'bets', newBet.id), newBet);
          await batch.commit();
        } catch (err) { console.error('[Store] changeTip Fehler:', err); }
      }
    },

    closeMarket: async (marketId) => {
      const state = get();
      const market = state.markets.find(m => m.id === marketId);
      if (!market || (market.status !== 'open' && market.status !== 'locked')) return;
      const marketBets = state.bets.filter(b => b.marketId === marketId);
      const pUpdates: Record<string, number> = {};
      marketBets.forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
      const clearedOptions = market.options.map(o => ({ ...o, pool: 0 }));
      set(s => ({
        markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'cancelled' as const, options: clearedOptions } : m),
        bets: s.bets.filter(b => b.marketId !== marketId),
        players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      }));
      if (db) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'markets', marketId), { status: 'cancelled', options: clearedOptions });
          for (const [pid, amt] of Object.entries(pUpdates)) {
            const p = state.players.find(pl => pl.id === pid);
            if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
          }
          for (const bet of marketBets) batch.delete(doc(db, 'bets', bet.id));
          await batch.commit();
        } catch (err) { console.error('[Store] closeMarket Fehler:', err); }
      }
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
      const state = get();
      const market = state.markets.find(m => m.id === marketId);
      if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
      const pUpdates: Record<string, number> = {};
      // Der angesparte jackpot ist für den Finale-Block reserviert und wird hier
      // nicht mehr ausgeschüttet. Offene Fragen werden vom Admin bei Bedarf
      // manuell per giveTokens belohnt.
      const newJackpot = state.jackpot;
      set(s => ({
        jackpot: newJackpot,
        markets: s.markets.map(m =>
          m.id === marketId
            ? { ...m, status: 'resolved', winningOptionId: winnerPlayerIds.join(',') || null, resolutionType: 'normal' }
            : m
        ),
        players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      }));
      if (db) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId: winnerPlayerIds.join(',') || null, resolutionType: 'normal' });
          batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
          Object.entries(pUpdates).forEach(([pid, amt]) => {
            const p = state.players.find(pl => pl.id === pid);
            if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
          });
          await batch.commit();
        } catch (err) {
          console.error('[Store] resolveOpenQuestion Fehler:', err);
        }
      }
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

    resolveMarket,

    resolveRollover: async (marketId) => {
      const state = get();
      const market = state.markets.find(m => m.id === marketId);
      if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
      const allBets = state.bets.filter(b => b.marketId === marketId);
      const pUpdates: Record<string, number> = {};
      let refunded = 0;
      allBets.forEach(b => { const r = Math.floor(b.amount * 0.5); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + r; refunded += r; });
      const newJackpot = state.jackpot + (getMarketTotal(market) - refunded);
      set(s => ({
        jackpot: newJackpot,
        markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId: null, resolutionType: 'rollover' } : m),
        players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      }));
      if (db) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId: null, resolutionType: 'rollover' });
          batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
          Object.entries(pUpdates).forEach(([pid, amt]) => {
            const p = state.players.find(pl => pl.id === pid);
            if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
          });
          await batch.commit();
        } catch (err) {
          console.error('[Store] resolveRollover Fehler:', err);
        }
      }
    },

    resolveStorno: async (marketId) => {
      const state = get();
      const market = state.markets.find(m => m.id === marketId);
      if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
      const pUpdates: Record<string, number> = {};
      state.bets.filter(b => b.marketId === marketId).forEach(b => {
        pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount;
      });
      set(s => ({
        markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'cancelled', resolutionType: 'storno' } : m),
        players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      }));
      if (db) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'markets', marketId), { status: 'cancelled', resolutionType: 'storno' });
          Object.entries(pUpdates).forEach(([pid, amt]) => {
            const p = state.players.find(pl => pl.id === pid);
            if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
          });
          await batch.commit();
        } catch (err) {
          console.error('[Store] resolveStorno Fehler:', err);
        }
      }
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
    reopenMarket: async (marketId) => {
      const m = get().markets.find(mk => mk.id === marketId);
      if (!m || (m.status !== 'paused' && m.status !== 'locked')) return;
      set(s => ({ markets: s.markets.map(mk => mk.id === marketId ? { ...mk, status: 'open' } : mk) }));
      if (db) {
        try {
          await updateDoc(doc(db, 'markets', marketId), { status: 'open' });
        } catch (err) {
          console.error('[Store] reopenMarket Fehler:', err);
        }
      }
    },

    giveTokens: async (playerId, amount) => {
      set(s => ({
        players: s.players.map(p => p.id === playerId ? { ...p, tokens: p.tokens + amount } : p),
      }));
      const updatedPlayer = get().players.find(p => p.id === playerId);
      if (db && updatedPlayer) {
        try {
          await updateDoc(doc(db, 'players', playerId), { tokens: updatedPlayer.tokens });
        } catch (err) {
          console.error('[Store] giveTokens Fehler:', err);
        }
      }
    },

    executeBuyback: async (playerId) => {
      const state = get();
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.buybackUsed) return;
      const newTokens = 800 + (player.tokens ?? 0);
      set(s => ({
        players: s.players.map(p => p.id === playerId ? { ...p, tokens: newTokens, buybackUsed: true } : p),
      }));
      if (db) {
        try {
          await updateDoc(doc(db, 'players', playerId), { tokens: newTokens, buybackUsed: true });
        } catch (err) {
          console.error('[Store] executeBuyback Fehler:', err);
        }
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
      set(s => ({ players: s.players.map(p => p.id === uid ? { ...p, dailyNetGain: net, unseenResolutions: ['sim-reveal'] } : p) }));
      if (db) {
        try { await updateDoc(doc(db, 'players', uid), { dailyNetGain: net, unseenResolutions: ['sim-reveal'] }); }
        catch (err) { console.error('[Store] simulateReveal Fehler:', err); }
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
      set(s => ({
        players: s.players.map(p => p.id === playerId
          ? { ...p, unlockedOverlays: Array.from(new Set([...(p.unlockedOverlays ?? []), accessoryId])) }
          : p),
      }));
      const p = get().players.find(pl => pl.id === playerId);
      if (db && p) {
        try { await updateDoc(doc(db, 'players', playerId), { unlockedOverlays: p.unlockedOverlays ?? [] }); }
        catch (err) { console.error('[Store] grantAccessory Fehler:', err); }
      }
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
      if (!db) return { ok: false, error: 'Keine Verbindung.' };
      const item = get().shopItems.find(i => i.id === itemId);
      if (!item) return { ok: false, error: 'Item nicht gefunden.' };
      // Spielplan-Freischaltung prüfen (clientseitig, Economy ist Trust-basiert).
      const unlockAt = shopUnlockAt(item, get().schedule);
      if (unlockAt != null && unlockAt > Date.now()) {
        return { ok: false, error: item.unlockLabel ? `Freischaltung: ${item.unlockLabel}.` : 'Noch nicht freigeschaltet.' };
      }

      try {
        let cost = 0;
        let itemLabel = item.label;
        await runTransaction(db, async (tx) => {
          const playerRef = doc(db, 'players', uid);
          const itemRef   = doc(db, 'shopItems', itemId);
          const [pSnap, iSnap] = await Promise.all([tx.get(playerRef), tx.get(itemRef)]);
          if (!pSnap.exists()) throw new Error('Spieler-Profil fehlt.');
          if (!iSnap.exists()) throw new Error('Item nicht mehr verfügbar.');
          const pdata = pSnap.data() as Player;
          const idata = iSnap.data() as ShopItem;
          itemLabel = idata.label ?? itemLabel;
          const now = Date.now();
          if (!idata.available) throw new Error('Aktuell nicht im Verkauf.');
          if (idata.availableFrom && idata.availableFrom > now) throw new Error('Noch nicht freigeschaltet.');
          if (idata.availableUntil && idata.availableUntil < now) throw new Error('Nicht mehr verfügbar.');
          const inv = pdata.shopInventory ?? [];
          if (inv.includes(itemId)) throw new Error('Bereits im Inventar.');
          // Knappheit: globalen Stock prüfen + atomar erhöhen (verhindert, dass
          // zwei gleichzeitige Käufe dasselbe Einzelstück abgreifen).
          const sold = idata.sold ?? 0;
          if (idata.stock != null && sold >= idata.stock) throw new Error('Ausverkauft.');
          const tokens = pdata.tokens ?? 0;
          if (tokens < idata.price) throw new Error(`Nicht genug Tokens (brauche ${idata.price}).`);
          cost = idata.price;
          tx.update(playerRef, {
            tokens: tokens - cost,
            shopInventory: [...inv, itemId],
          });
          if (idata.stock != null) tx.update(itemRef, { sold: sold + 1 });
        });

        // Optimistic local update
        set(s => ({
          players: s.players.map(p => p.id === uid
            ? { ...p, tokens: (p.tokens ?? 0) - cost, shopInventory: [...(p.shopInventory ?? []), itemId] }
            : p),
        }));

        // Feed-Eintrag (best-effort)
        const player = get().players.find(p => p.id === uid);
        try {
          await addDoc(collection(db, 'feed'), {
            type: 'shop_purchase',
            playerId: uid,
            playerName: player?.name ?? '',
            text: `${player?.name ?? 'Jemand'} hat „${itemLabel}" im Shop gekauft 🛍️`,
            creditsChange: -cost,
            ts: serverTimestamp(),
          });
        } catch (err) {
          console.warn('[Store] Shop-Kauf Feed-Event Fehler:', err);
        }
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

    // ── Shop: erste echte Item-Charge anlegen/aktualisieren (Schwechi, …) ───
    // Upsert: neue Items werden angelegt, bereits vorhandene bekommen die
    // aktuellen Freischalt-/Stock-Felder (unlockRule, unlockLabel, available,
    // stock, price …) gemerged — die bereits verkaufte Stückzahl bleibt erhalten.
    seedShopFirstItems: async () => {
      if (!db) return { added: 0 };
      const existing = new Map(get().shopItems.map(i => [i.id, i]));
      const now = Date.now();
      let added = 0;
      try {
        for (const it of SHOP_FIRST_ITEMS) {
          const prev = existing.get(it.id);
          if (!prev) {
            await setDoc(doc(db, 'shopItems', it.id), { ...it, createdAt: now });
            added++;
          } else {
            // sold nicht überschreiben — nur Definition aktualisieren.
            const { sold: _seed, ...defWithoutSold } = it;
            await updateDoc(doc(db, 'shopItems', it.id), defWithoutSold as any);
          }
        }
        await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
      } catch (err) {
        console.error('[Store] seedShopFirstItems Fehler:', err);
      }
      return { added };
    },

    // ── Shop: Trikot-Items anlegen/aktualisieren (asv_retro, kapitn_zrce, ferko) ──
    // Gleiche Upsert-Logik wie seedShopFirstItems: neue Items werden gesetzt,
    // bereits vorhandene bekommen die aktuelle Definition gemerged (sold bleibt).
    seedShopTorsoItems: async () => {
      if (!db) return { added: 0 };
      const existing = new Map(get().shopItems.map(i => [i.id, i]));
      const now = Date.now();
      let added = 0;
      try {
        for (const it of SHOP_TORSO_ITEMS) {
          const prev = existing.get(it.id);
          if (!prev) {
            await setDoc(doc(db, 'shopItems', it.id), { ...it, createdAt: now });
            added++;
          } else {
            const { sold: _seed, ...defWithoutSold } = it;
            await updateDoc(doc(db, 'shopItems', it.id), defWithoutSold as any);
          }
        }
        await setDoc(doc(db, 'appState', 'global'), { shopLastDropTs: now }, { merge: true });
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

    // Vollständiger Reset (Testmodus): leert ALLE Spieldaten inkl. Test-Spieler.
    // Admin-Accounts, Spielplan und Invite-Code bleiben erhalten.
    fullReset: async () => {
      clearSessionCookie();
      const state = get();
      const keptPlayers = state.players.filter(p => !p.isTestPlayer);
      const resetFields = {
        tokens: 1000, buybackUsed: false, comboMalus: false, badges: [],
        currentStreak: 0, bestStreak: 0, streakLevel: 'none' as StreakLevel,
        streakHistory: [], austriaSpecialCorrect: 0, underdogCorrect: 0,
        dailyNetGain: 0, unlockedOverlays: [], activeAccessoryId: null,
        activeBadgeId: null, unseenResolutions: [],
        // Shop: alles auf null im fullReset (Testmodus-Wipe). Der per-Spieler
        // Charakter-Reset (resetPlayerCharacter) lässt Inventar dagegen in Ruhe.
        shopInventory: [], activeShopItems: {}, lastShopVisitTs: 0,
      };
      // Optimistic local update.
      set({
        markets: [], bets: [], answers: [], feed: [], jackpot: 0,
        currentPhase: 'gruppenphase', testMode: true, adminMessage: '',
        players: keptPlayers.map(p => ({ ...p, ...resetFields })),
      });
      if (!db) return;
      try {
        // ── Spieler-Tokens ZUERST in Firestore schreiben, damit nachfolgende
        // onSnapshot-Events (ausgelöst durch deleteAll) bereits die neuen Werte
        // zurückliefern und den lokalen Zustand nicht mehr überschreiben.
        for (const p of keptPlayers) {
          await setDoc(doc(db, 'players', p.id), resetFields, { merge: true });
        }

        const deleteAll = async (colName: string, filter?: (data: any) => boolean) => {
          const snap = await getDocs(collection(db, colName));
          const docsToDelete = filter ? snap.docs.filter(d => filter(d.data())) : snap.docs;
          for (let i = 0; i < docsToDelete.length; i += 400) {
            const batch = writeBatch(db);
            docsToDelete.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        };
        await deleteAll('bets');
        await deleteAll('markets');
        await deleteAll('answers');
        await deleteAll('feed');
        await deleteAll('players', (d) => d.isTestPlayer === true);
        // Shop-Katalog bleibt erhalten, aber verkaufte Stückzahlen zurücksetzen,
        // damit knappe Items nicht fälschlich „ausverkauft" bleiben.
        const shopSnap = await getDocs(collection(db, 'shopItems'));
        for (const d of shopSnap.docs) {
          if ((d.data() as ShopItem).sold) await updateDoc(d.ref, { sold: 0 });
        }
        await setDoc(doc(db, 'appState', 'global'), { jackpot: 0, testMode: true, adminMessage: '', currentMatchday: '' }, { merge: true });
      } catch (err) {
        console.error('[Store] fullReset Fehler:', err);
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
        try {
          await setDoc(doc(db, 'players', uid), { id: uid, ...data });
        } catch (err) {
          console.error('[Store] registerPlayer Fehler:', err);
        }
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