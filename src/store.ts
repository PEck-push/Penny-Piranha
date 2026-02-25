import { create } from 'zustand';
import { db } from './firebase';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

export type Badge = 'MARKET MOVER' | 'THE WHALE' | 'BANKROTT' | 'STREAK';
export type ResolutionType = 'normal' | 'rollover' | 'storno' | 'no-winner' | 'all-same-side';
export type ComboStatus = 'active' | 'partial' | 'won' | 'lost' | 'cancelled';

// NEU: Jede Option hat id, label und pool
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
  options: MarketOption[];   // ERSETZT poolYes / poolNo
  createdAt: number;
  expiresAt?: number;
  createdBy: string;
  winningOptionId?: string | null;
  resolutionType?: ResolutionType | null;
}

export interface Bet {
  id: string;
  marketId: string;
  playerId: string;
  optionId: string;      // ERSETZT side: 'yes' | 'no'
  optionLabel: string;   // NEU: für die Anzeige
  amount: number;
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

// Helper: Gesamtpool eines Markts
export const getMarketTotal = (m: Market) => m.options.reduce((s, o) => s + o.pool, 0);

interface AppState {
  players: Player[];
  markets: Market[];
  bets: Bet[];
  combos: Combo[];
  jackpot: number;
  currentUser: string | null;
  isAdmin: boolean;

  login: (playerId: string, avatar: string, avatarColor: string) => void;
  logout: () => void;
  setAdmin: (isAdmin: boolean) => void;
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => void;
  createMarket: (market: Omit<Market, 'id' | 'createdAt'>) => void;
  resolveMarket: (marketId: string, winningOptionId: string) => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  giveTokens: (playerId: string, amount: number) => void;
  resetState: () => void;
}

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

export const INITIAL_MARKETS: Market[] = [
  {
    id: 'm1', question: 'Gewinnt Max das nächste Mario Kart Rennen?',
    type: 'standard', status: 'open', createdBy: 'admin',
    options: [{ id: 'yes', label: 'JA', pool: 120 }, { id: 'no', label: 'NEIN', pool: 80 }],
    createdAt: Date.now() - 100000, winningOptionId: null, resolutionType: null,
  },
  {
    id: 'm2', question: 'Wird Jonas beim nächsten Runde Bier bestellen?',
    type: 'hot-take', status: 'open', createdBy: 'admin',
    options: [{ id: 'yes', label: 'JA', pool: 60 }, { id: 'no', label: 'NEIN', pool: 24 }],
    createdAt: Date.now(), expiresAt: Date.now() + 60000, winningOptionId: null, resolutionType: null,
  },
  {
    id: 'm3', question: 'Wer hat heimlich Käsebrot mitgebracht?',
    type: 'anonymous', status: 'open', createdBy: 'admin',
    options: [{ id: 'yes', label: 'JA', pool: 45 }, { id: 'no', label: 'NEIN', pool: 55 }],
    createdAt: Date.now() - 200000, winningOptionId: null, resolutionType: null,
  },
];

const INITIAL_BETS: Bet[] = [
  { id: 'b1', marketId: 'm1', playerId: 'p3',  optionId: 'yes', optionLabel: 'JA',   amount: 50, timestamp: Date.now() },
  { id: 'b2', marketId: 'm1', playerId: 'p7',  optionId: 'yes', optionLabel: 'JA',   amount: 50, timestamp: Date.now() },
  { id: 'b3', marketId: 'm1', playerId: 'p4',  optionId: 'yes', optionLabel: 'JA',   amount: 20, timestamp: Date.now() },
  { id: 'b4', marketId: 'm1', playerId: 'p5',  optionId: 'no',  optionLabel: 'NEIN', amount: 60, timestamp: Date.now() },
  { id: 'b5', marketId: 'm1', playerId: 'p10', optionId: 'no',  optionLabel: 'NEIN', amount: 20, timestamp: Date.now() },
];

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
  players: INITIAL_PLAYERS, markets: INITIAL_MARKETS,
  bets: INITIAL_BETS, combos: [], jackpot: 38,
  currentUser: null, isAdmin: false,

  login: async (playerId, avatar, avatarColor) => {
    set(s => ({ currentUser: playerId, players: s.players.map(p => p.id === playerId ? { ...p, avatar, avatarColor } : p) }));
    if (db) await setDoc(doc(db, 'players', playerId), { avatar, avatarColor }, { merge: true });
  },
  logout: () => set({ currentUser: null, isAdmin: false }),
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
      if (!mkt) return;
      const batch = writeBatch(db);
      batch.set(doc(db, 'bets', bet.id), bet);
      batch.update(doc(db, 'players', player.id), { tokens: player.tokens - amount });
      batch.update(doc(db, 'markets', marketId), { options: mkt.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o) });
      await batch.commit();
    }
  },

  createMarket: async (marketData) => {
    const m: Market = { ...marketData, id: Math.random().toString(36).substring(7), createdAt: Date.now(), winningOptionId: null, resolutionType: null };
    set(s => ({ markets: [...s.markets, m] }));
    if (db) await setDoc(doc(db, 'markets', m.id), m);
  },

  resolveMarket: async (marketId, winningOptionId) => {
    const state = get();
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved' || market.status === 'cancelled') return;
    const winOpt = market.options.find(o => o.id === winningOptionId);
    if (!winOpt) return;

    const totalPool = getMarketTotal(market);
    const winPool = winOpt.pool;
    const allBets = state.bets.filter(b => b.marketId === marketId);
    const winBets = allBets.filter(b => b.optionId === winningOptionId);
    const pUpdates: Record<string, number> = {};
    let newJackpot = state.jackpot;
    let resType: ResolutionType;

    if (winPool === 0) {
      resType = 'no-winner';
      let refunded = 0;
      allBets.forEach(b => { const r = Math.floor(b.amount * 0.5); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + r; refunded += r; });
      newJackpot = state.jackpot + (totalPool - refunded);
    } else if (winPool === totalPool) {
      resType = 'all-same-side';
      let jpPaid = 0;
      winBets.forEach(b => { const share = state.jackpot > 0 ? Math.floor((b.amount / winPool) * state.jackpot) : 0; pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + b.amount + share; jpPaid += share; });
      newJackpot = Math.max(0, state.jackpot - jpPaid);
    } else {
      resType = 'normal';
      const eff = totalPool + state.jackpot;
      let paid = 0;
      winBets.forEach(b => { const p = Math.floor((b.amount / winPool) * eff); pUpdates[b.playerId] = (pUpdates[b.playerId] || 0) + p; paid += p; });
      newJackpot = Math.max(0, eff - paid);
    }

    set(s => ({
      jackpot: newJackpot,
      markets: s.markets.map(m => m.id === marketId ? { ...m, status: 'resolved', winningOptionId, resolutionType: resType } : m),
      players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
    }));
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId, resolutionType: resType });
      batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
      Object.entries(pUpdates).forEach(([pid, amt]) => { const p = state.players.find(pl => pl.id === pid); if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt }); });
      await batch.commit();
    }
    await updateCombosForResolvedMarket(get(), marketId, winningOptionId, fn => set(fn as any));
  },

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
      const batch = writeBatch(db);
      batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId: null, resolutionType: 'rollover' });
      batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
      Object.entries(pUpdates).forEach(([pid, amt]) => { const p = state.players.find(pl => pl.id === pid); if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt }); });
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

  resetState: () => set({ players: INITIAL_PLAYERS, markets: INITIAL_MARKETS, bets: INITIAL_BETS, combos: [], jackpot: 38 }),
}));