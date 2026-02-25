import { create } from 'zustand';
import { db } from './firebase';
import { doc, setDoc, updateDoc, writeBatch, collection } from 'firebase/firestore';

export type Badge = 'MARKET MOVER' | 'THE WHALE' | 'BANKROTT' | 'STREAK';
export type ResolutionType = 'normal' | 'rollover' | 'storno' | 'no-winner' | 'all-same-side';
export type ComboStatus = 'active' | 'partial' | 'won' | 'lost' | 'cancelled';

export interface MarketOption {
  id: string;
  label: string;
  pool: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  avatarColor: string;
  tokens: number;
  comboMalus: boolean;
  badges: Badge[];
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
  isOpenQuestion?: boolean; // NEW: for anonymous open-text questions
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

// NEW: Open-text answer for anonymous open-question markets
export interface Answer {
  id: string;
  marketId: string;
  playerId: string;
  text: string;
  timestamp: number;
}

export interface ComboLeg {
  marketId: string;
  marketQuestion: string;
  predictedOptionId: string;
  predictedOptionLabel: string;
  actualOptionId: string | null;
  legStatus: 'pending' | 'hit' | 'miss' | 'cancelled';
}

export interface Combo {
  id: string;
  playerId: string;
  stake: number;
  legs: ComboLeg[];
  legCount: number;
  multiplier: number;
  potentialPayout: number;
  status: ComboStatus;
  hitsRequired: number;
  hitsAchieved: number;
  createdAt: number;
}

export const getMarketTotal = (m: Market) => m.options.reduce((s, o) => s + o.pool, 0);

// ─── Cookie helpers ────────────────────────────────────────────────────────────
export const saveSessionCookie = (playerId: string, avatar: string, avatarColor: string) => {
  const value = encodeURIComponent(JSON.stringify({ playerId, avatar, avatarColor }));
  document.cookie = `betpanda_session=${value}; max-age=604800; path=/`; // 7 days
};

export const readSessionCookie = (): { playerId: string; avatar: string; avatarColor: string } | null => {
  try {
    const match = document.cookie.split('; ').find(r => r.startsWith('betpanda_session='));
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match.split('=')[1]));
  } catch {
    return null;
  }
};

export const clearSessionCookie = () => {
  document.cookie = 'betpanda_session=; max-age=0; path=/';
};

interface AppState {
  players: Player[];
  markets: Market[];
  bets: Bet[];
  combos: Combo[];
  answers: Answer[];  // NEW
  jackpot: number;
  currentUser: string | null;
  isAdmin: boolean;

  login: (playerId: string, avatar: string, avatarColor: string) => void;
  logout: () => void;
  setAdmin: (isAdmin: boolean) => void;
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => void;
  submitAnswer: (marketId: string, text: string) => void; // NEW
  createMarket: (market: Omit<Market, 'id' | 'createdAt'>) => void;
  resolveMarket: (marketId: string, winningOptionId: string) => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  giveTokens: (playerId: string, amount: number) => void;
  resetState: () => void;
}

// ─── INITIAL STATE — all zero ─────────────────────────────────────────────────
export const INITIAL_PLAYERS: Player[] = [
  { id: 'p1',  name: 'Alex',    avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p2',  name: 'Neigi',   avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p3',  name: 'Michi',   avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p4',  name: 'Steindl', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p5',  name: 'Paco',    avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p6',  name: 'Luigi',   avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p7',  name: 'Stefan',  avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p8',  name: 'Jakob',   avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p9',  name: 'Philipp', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p10', name: 'Memo',    avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p11', name: 'Moz',     avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
];

// ─── All pools start at 0, no pre-filled markets ──────────────────────────────
export const INITIAL_MARKETS: Market[] = [];

const INITIAL_BETS: Bet[] = [];

// ─── COMBO HELPERS ─────────────────────────────────────────────────────────────
async function updateCombosForResolvedMarket(
  state: AppState, marketId: string, winningOptionId: string,
  setFn: (fn: (s: AppState) => Partial<AppState>) => void
) {
  const active = state.combos.filter(
    c => (c.status === 'active' || c.status === 'partial') && c.legs.some(l => l.marketId === marketId)
  );
  if (!active.length) return;
  const updates: Combo[] = [];
  const tokenUpdates: Record<string, number> = {};

  for (const combo of active) {
    const idx = combo.legs.findIndex(l => l.marketId === marketId);
    if (idx === -1) continue;
    const hit = combo.legs[idx].predictedOptionId === winningOptionId;
    const legs = combo.legs.map((l, i) =>
      i === idx ? { ...l, legStatus: (hit ? 'hit' : 'miss') as 'hit'|'miss', actualOptionId: winningOptionId } : l
    );
    if (!hit) {
      updates.push({ ...combo, status: 'lost', legs });
    } else {
      const hits = combo.hitsAchieved + 1;
      if (hits === combo.hitsRequired) {
        updates.push({ ...combo, status: 'won', legs, hitsAchieved: hits });
        tokenUpdates[combo.playerId] = (tokenUpdates[combo.playerId] || 0) + combo.potentialPayout;
      } else {
        updates.push({ ...combo, status: 'partial', legs, hitsAchieved: hits });
      }
    }
  }
  const lostStakes = updates.filter(c => c.status === 'lost').reduce((s, c) => s + c.stake, 0);
  setFn(s => ({
    combos: s.combos.map(c => updates.find(u => u.id === c.id) ?? c),
    jackpot: s.jackpot + lostStakes,
    players: s.players.map(p => tokenUpdates[p.id] ? { ...p, tokens: p.tokens + tokenUpdates[p.id] } : p),
  }));
  if (db) {
    const batch = writeBatch(db);
    updates.forEach(c => batch.update(doc(db, 'combos', c.id), { status: c.status, legs: c.legs, hitsAchieved: c.hitsAchieved }));
    await batch.commit();
  }
}

async function cancelCombosWithMarket(
  state: AppState, marketId: string,
  setFn: (fn: (s: AppState) => Partial<AppState>) => void
) {
  const affected = state.combos.filter(
    c => (c.status === 'active' || c.status === 'partial') && c.legs.some(l => l.marketId === marketId)
  );
  if (!affected.length) return;
  const refunds: Record<string, number> = {};
  affected.forEach(c => { refunds[c.playerId] = (refunds[c.playerId] || 0) + c.stake; });
  setFn(s => ({
    combos: s.combos.map(c => affected.find(a => a.id === c.id) ? { ...c, status: 'cancelled' } : c),
    players: s.players.map(p => refunds[p.id] ? { ...p, tokens: p.tokens + refunds[p.id] } : p),
  }));
  if (db) {
    const batch = writeBatch(db);
    affected.forEach(c => {
      batch.update(doc(db, 'combos', c.id), { status: 'cancelled' });
      const p = state.players.find(pl => pl.id === c.playerId);
      if (p) batch.update(doc(db, 'players', c.playerId), { tokens: p.tokens + c.stake });
    });
    await batch.commit();
  }
}

// ─── STORE ─────────────────────────────────────────────────────────────────────
export const useStore = create<AppState>((set, get) => ({
  players: INITIAL_PLAYERS,
  markets: INITIAL_MARKETS,
  bets: INITIAL_BETS,
  combos: [],
  answers: [],
  jackpot: 0,          // starts at 0
  currentUser: null,
  isAdmin: false,

  login: async (playerId, avatar, avatarColor) => {
    set(s => ({ currentUser: playerId, players: s.players.map(p => p.id === playerId ? { ...p, avatar, avatarColor } : p) }));
    saveSessionCookie(playerId, avatar, avatarColor); // persist session
    if (db) await setDoc(doc(db, 'players', playerId), { avatar, avatarColor }, { merge: true });
  },

  logout: () => {
    clearSessionCookie();
    set({ currentUser: null, isAdmin: false });
  },

  setAdmin: (isAdmin) => set({ isAdmin }),

  placeBet: async (marketId, optionId, optionLabel, amount) => {
    const state = get();
    if (!state.currentUser) return;
    const player = state.players.find(p => p.id === state.currentUser);
    if (!player || player.tokens < amount) return;
    const bet: Bet = { id: Math.random().toString(36).substring(7), marketId, playerId: state.currentUser, optionId, optionLabel, amount, timestamp: Date.now() };
    set(s => ({
      bets: [...s.bets, bet],
      players: s.players.map(p => p.id === s.currentUser ? { ...p, tokens: p.tokens - amount } : p),
      markets: s.markets.map(m => m.id === marketId
        ? { ...m, options: m.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o) }
        : m),
    }));
    if (db) {
      const mkt = state.markets.find(m => m.id === marketId);
      const updatedOpts = mkt?.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o);
      const batch = writeBatch(db);
      batch.set(doc(db, 'bets', bet.id), bet);
      batch.update(doc(db, 'players', state.currentUser), { tokens: player.tokens - amount });
      if (mkt && updatedOpts) batch.update(doc(db, 'markets', marketId), { options: updatedOpts });
      await batch.commit();
    }
  },

  // NEW: Submit open-text answer for anonymous open-question markets
  submitAnswer: async (marketId, text) => {
    const state = get();
    if (!state.currentUser) return;
    const answer: Answer = {
      id: Math.random().toString(36).substring(7),
      marketId,
      playerId: state.currentUser,
      text: text.trim(),
      timestamp: Date.now(),
    };
    set(s => ({ answers: [...s.answers, answer] }));
    if (db) {
      await setDoc(doc(db, 'answers', answer.id), answer);
    }
  },

  createMarket: async (market) => {
    const newMarket: Market = { ...market, id: Math.random().toString(36).substring(7), createdAt: Date.now() };
    set(s => ({ markets: [...s.markets, newMarket] }));
    if (db) await setDoc(doc(db, 'markets', newMarket.id), newMarket);
  },

  resolveMarket: async (marketId, winningOptionId) => {
    const state = get();
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved' || market.status === 'cancelled') return;

    const winOpt = market.options.find(o => o.id === winningOptionId);
    const total = getMarketTotal(market);
    const pUpdates: Record<string, number> = {};

    if (!winOpt || winOpt.pool === 0) {
      // no-winner: refund all
      state.bets.filter(b => b.marketId === marketId).forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
      set(s => ({
        markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId, resolutionType: 'no-winner' } : m),
        players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      }));
    } else {
      const allSameSide = market.options.filter(o => o.id !== winningOptionId).every(o => o.pool === 0);
      if (allSameSide) {
        // refund all
        state.bets.filter(b => b.marketId === marketId).forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
        set(s => ({
          markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId, resolutionType: 'all-same-side' } : m),
          players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
        }));
      } else {
        const currentJackpot = state.jackpot;
        const jackpotWinnerBet = state.bets.filter(b => b.marketId === marketId && b.optionId === winningOptionId)
          .sort((a, b) => b.amount - a.amount)[0];
        state.bets.filter(b => b.marketId === marketId && b.optionId === winningOptionId).forEach(b => {
          pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + Math.floor((b.amount / winOpt.pool) * total);
        });
        set(s => ({
          markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId, resolutionType: 'normal' } : m),
          players: s.players.map(p => {
            let bonus = pUpdates[p.id] || 0;
            if (jackpotWinnerBet && p.id === jackpotWinnerBet.playerId) bonus += currentJackpot;
            return bonus ? { ...p, tokens: p.tokens + bonus } : p;
          }),
          jackpot: jackpotWinnerBet ? 0 : s.jackpot,
        }));
      }
    }
    if (db) {
      const batch = writeBatch(db);
      const updatedState = get();
      batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId, resolutionType: updatedState.markets.find(m => m.id === marketId)?.resolutionType });
      Object.entries(pUpdates).forEach(([pid, _]) => {
        const p = updatedState.players.find(pl => pl.id === pid);
        if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens });
      });
      const appStateRef = doc(db, 'appState', 'global');
      batch.set(appStateRef, { jackpot: updatedState.jackpot }, { merge: true });
      await batch.commit();
    }
    await updateCombosForResolvedMarket(get(), marketId, winningOptionId, fn => set(fn as any));
  },

  resolveRollover: async (marketId) => {
    const state = get();
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
    const pUpdates: Record<string, number> = {};
    state.bets.filter(b => b.marketId === marketId).forEach(b => {
      pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + Math.floor(b.amount * 0.5);
    });
    const addToJackpot = state.bets.filter(b => b.marketId === marketId).reduce((s, b) => s + Math.floor(b.amount * 0.5), 0);
    set(s => ({
      markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', resolutionType: 'rollover' } : m),
      players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
      jackpot: s.jackpot + addToJackpot,
    }));
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'markets', marketId), { status: 'resolved', resolutionType: 'rollover' });
      Object.entries(pUpdates).forEach(([pid, amt]) => { const p = state.players.find(pl => pl.id === pid); if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt }); });
      batch.set(doc(db, 'appState', 'global'), { jackpot: get().jackpot }, { merge: true });
      await batch.commit();
    }
    await cancelCombosWithMarket(get(), marketId, fn => set(fn as any));
  },

  resolveStorno: async (marketId) => {
    const state = get();
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
    const pUpdates: Record<string, number> = {};
    state.bets.filter(b => b.marketId === marketId).forEach(b => { pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount; });
    set(s => ({
      markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'cancelled', resolutionType: 'storno' } : m),
      players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
    }));
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'markets', marketId), { status: 'cancelled', resolutionType: 'storno' });
      Object.entries(pUpdates).forEach(([pid, amt]) => { const p = state.players.find(pl => pl.id === pid); if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt }); });
      await batch.commit();
    }
    await cancelCombosWithMarket(get(), marketId, fn => set(fn as any));
  },

  lockMarket: async (marketId) => {
    set(s => ({ markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'locked' } : m) }));
    if (db) await updateDoc(doc(db, 'markets', marketId), { status: 'locked' });
  },

  giveTokens: async (playerId, amount) => {
    const player = get().players.find(p => p.id === playerId);
    set(s => ({ players: s.players.map(p => p.id === playerId ? { ...p, tokens: p.tokens + amount } : p) }));
    if (db && player) await updateDoc(doc(db, 'players', playerId), { tokens: player.tokens + amount });
  },

  resetState: () => set({
    players: INITIAL_PLAYERS,
    markets: INITIAL_MARKETS,
    bets: INITIAL_BETS,
    combos: [],
    answers: [],
    jackpot: 0,  // reset to 0
  }),
}));
