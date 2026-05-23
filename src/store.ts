import { create } from 'zustand';
import { db, auth } from './firebase';
import { doc, setDoc, updateDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export type FeedEventType =
  | 'bet_placed' | 'market_resolved' | 'streak_on_fire' | 'streak_damn_hot'
  | 'badge_unlocked' | 'underdog_win' | 'phase_winner' | 'jackpot_distribution'
  | 'buyback' | 'market_locked';

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
  activeBadgeId?: BadgeId | null;
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
}

export interface Market {
  id: string;
  question: string;
  type: 'standard' | 'hot-take' | 'anonymous' | 'combo';
  status: 'open' | 'locked' | 'resolved' | 'cancelled';
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
}

export interface Bet {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;
  optionLabel: string;
  amount: number;
  timestamp: number;
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
}

export const getMarketTotal = (m: Market) => m.options.reduce((s, o) => s + o.pool, 0);

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
  jackpot: number;
  currentPhase: string; // Phase string from appState/global
  testMode: boolean; // per Default true; via "Live gehen" deaktiviert
  currentUser: string | null;

  login: (playerId: string, avatar: string, avatarColor: string, avatarId: string) => void;
  logout: () => void;
  setCurrentUser: (uid: string | null) => void;
  registerPlayer: (uid: string, data: Omit<Player, 'id'>) => Promise<void>;
  logoutAuth: () => Promise<void>;
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => void;
  placeBetAs: (playerId: string, marketId: string, optionId: string, optionLabel: string, amount: number) => Promise<void>;
  placeTip: (marketId: string, optionId: string, optionLabel: string) => void;
  placeTipAs: (playerId: string, marketId: string, optionId: string, optionLabel: string) => Promise<void>;
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
  giveTokens: (playerId: string, amount: number) => void;
  executeBuyback: (playerId: string) => Promise<void>;
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
    } else if (!winOpt || winPool === 0) {
      resType = 'no-winner';
      let refunded = 0;
      allBets.forEach(b => { const r = Math.floor(b.amount * 0.5); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + r; refunded += r; });
      newJackpot = state.jackpot + (totalPool - refunded);
    } else if (winPool === totalPool) {
      // Alle auf derselben Seite: reine Rückzahlung des Einsatzes.
      // Der jackpot bleibt unangetastet (wird für den Finale-Block angespart).
      resType = 'all-same-side';
      winBets.forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
    } else {
      // Reine Parimutuel-Auszahlung aus den Spieler-Einsätzen. Der jackpot
      // wird NICHT mehr eingerechnet, sondern angespart; nur der Rundungsrest
      // fließt hinzu.
      resType = 'normal';
      const eff = totalPool;
      let paid = 0;
      winBets.forEach(b => { const p = Math.floor((b.amount / winPool) * eff); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + p; paid += p; });
      newJackpot = state.jackpot + Math.max(0, eff - paid);
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
    jackpot: 0,
    currentPhase: 'gruppenphase',
    testMode: true,
    currentUser: null,

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
      const alreadyBet = state.bets.some(b => b.marketId === marketId && b.playerId === playerId);
      if (alreadyBet) return;

      const bet: Bet = {
        id: Math.random().toString(36).substring(7),
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
        id: Math.random().toString(36).substring(7),
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
        id: Math.random().toString(36).substring(7),
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
        ...marketData, id: Math.random().toString(36).substring(7),
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

    resetState: () => {
      clearSessionCookie();
      set({ players: INITIAL_PLAYERS, markets: [], bets: [], answers: [], feed: [], schedule: [], jackpot: 0, currentPhase: 'gruppenphase', testMode: true, currentUser: null });
    },

    // Erfundener Mitspieler (nur Testmodus). Wird in Firestore gespeichert, damit
    // er bei Wetten/Pools/Auflösung wie ein echter Spieler mitzählt.
    createTestPlayer: async (name) => {
      const id = `test-${Math.random().toString(36).substring(2, 9)}`;
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
      // Verbleibende (Admin-)Spieler auf Startzustand zurücksetzen.
      const keptPlayers = state.players.filter(p => !p.isTestPlayer);
      const resetFields = {
        tokens: 1000, buybackUsed: false, comboMalus: false, badges: [],
        currentStreak: 0, bestStreak: 0, streakLevel: 'none' as StreakLevel,
        streakHistory: [], austriaSpecialCorrect: 0, underdogCorrect: 0,
        dailyNetGain: 0, unlockedOverlays: [], activeAccessoryId: null,
        activeBadgeId: null, unseenResolutions: [],
      };
      // Lokalen Zustand sofort leeren (Admin-Spieler bleiben, Tokens zurück).
      set({
        markets: [], bets: [], answers: [], feed: [], jackpot: 0,
        currentPhase: 'gruppenphase', testMode: true,
        players: keptPlayers.map(p => ({ ...p, ...resetFields })),
      });
      if (!db) return;
      try {
        // Sammlungen in Chunks von 400 löschen (Firestore-Batch-Limit: 500).
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
        // Verbleibende Spieler in Firestore auf Startguthaben zurücksetzen.
        for (const p of keptPlayers) {
          await updateDoc(doc(db, 'players', p.id), resetFields);
        }
        await setDoc(doc(db, 'appState', 'global'), { jackpot: 0, testMode: true }, { merge: true });
      } catch (err) {
        console.error('[Store] fullReset Fehler:', err);
      }
    },

    setCurrentUser: (uid) => set({ currentUser: uid }),

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