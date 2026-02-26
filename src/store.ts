import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from './firebase';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

export type Badge = 'MARKET MOVER' | 'THE WHALE' | 'BANKROTT' | 'STREAK';
export type ResolutionType = 'normal' | 'rollover' | 'storno' | 'no-winner' | 'all-same-side';

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
  isOpenQuestion?: boolean;
  comboLegs?: MarketComboLeg[];
  multiplier?: number;
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

export const getMarketTotal = (m: Market) => m.options.reduce((s, o) => s + o.pool, 0);

// ─── Cookie helpers ────────────────────────────────────────────────────────────
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
export const clearSessionCookie = () => { document.cookie = 'betpanda_session=; max-age=0; path=/'; };

// ─── Initial Data ──────────────────────────────────────────────────────────────
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
export const INITIAL_MARKETS: Market[] = [];

interface AppState {
  players: Player[];
  markets: Market[];
  bets: Bet[];
  answers: Answer[];
  jackpot: number;
  currentUser: string | null;

  login: (playerId: string, avatar: string, avatarColor: string) => void;
  logout: () => void;
  placeBet: (marketId: string, optionId: string, optionLabel: string, amount: number) => void;
  submitAnswer: (marketId: string, text: string) => void;
  createMarket: (market: Omit<Market, 'id' | 'createdAt'>) => void;
  resolveOpenQuestion: (marketId: string, winnerPlayerIds: string[]) => void;
  resolveMarket: (marketId: string, winningOptionId: string) => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  giveTokens: (playerId: string, amount: number) => void;
  resetState: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      // resolveMarket defined as closure so it can recurse for combos
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

        if (market.type === 'combo') {
          // Fixed multiplier payout for combos
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
            // Try to fund from jackpot; rest is "house money" for party game
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
          Object.entries(pUpdates).forEach(([pid, amt]) => {
            const p = state.players.find(pl => pl.id === pid);
            if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
          });
          await batch.commit();
        }

        // After resolving a regular market, check if any combo markets need auto-resolution
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
            if (db) await updateDoc(doc(db, 'markets', combo.id), { comboLegs: updatedLegs });

            if (updatedLegs.some(l => l.status === 'miss')) {
              await resolveMarket(combo.id, 'combo-miss');
            } else if (updatedLegs.every(l => l.status === 'hit')) {
              await resolveMarket(combo.id, 'combo-win');
            }
          }
        }
      };

      return {
        players: INITIAL_PLAYERS,
        markets: INITIAL_MARKETS,
        bets: [],
        answers: [],
        jackpot: 0,
        currentUser: null,

        login: async (playerId, avatar, avatarColor) => {
          set(s => ({ currentUser: playerId, players: s.players.map(p => p.id === playerId ? { ...p, avatar, avatarColor } : p) }));
          saveSessionCookie(playerId, avatar, avatarColor);
          if (db) await setDoc(doc(db, 'players', playerId), { avatar, avatarColor }, { merge: true });
        },

        logout: () => {
          clearSessionCookie();
          const userId = get().currentUser;
          set(s => ({
            currentUser: null,
            players: s.players.map(p => p.id === userId ? { ...p, avatar: '', avatarColor: '' } : p),
          }));
          if (db && userId) updateDoc(doc(db, 'players', userId), { avatar: '', avatarColor: '' }).catch(() => {});
        },

        placeBet: async (marketId, optionId, optionLabel, amount) => {
          const state = get();
          if (!state.currentUser) return;
          const player = state.players.find(p => p.id === state.currentUser);
          if (!player || player.tokens < amount) return;
          const mkt = state.markets.find(m => m.id === marketId);
          if (mkt?.expiresAt && Date.now() > mkt.expiresAt) return; // hot take expired
          // ── One bet per player per market ──────────────────────────────────
          const alreadyBet = state.bets.some(b => b.marketId === marketId && b.playerId === state.currentUser);
          if (alreadyBet) return;

          const bet: Bet = { id: Math.random().toString(36).substring(7), marketId, playerId: state.currentUser, optionId, optionLabel, amount, timestamp: Date.now() };
          set(s => ({
            bets: [...s.bets, bet],
            players: s.players.map(p => p.id === s.currentUser ? { ...p, tokens: p.tokens - amount } : p),
            markets: s.markets.map(m => m.id === marketId ? { ...m, options: m.options.map(o => o.id === optionId ? { ...o, pool: o.pool + amount } : o) } : m),
          }));
          if (db) {
            const updatedMkt = get().markets.find(m => m.id === marketId);
            const batch = writeBatch(db);
            batch.set(doc(db, 'bets', bet.id), bet);
            batch.update(doc(db, 'players', state.currentUser!), { tokens: player.tokens - amount });
            if (updatedMkt) batch.update(doc(db, 'markets', marketId), { options: updatedMkt.options });
            await batch.commit();
          }
        },

        resolveOpenQuestion: async (marketId, winnerPlayerIds) => {
          const state = get();
          const market = state.markets.find(m => m.id === marketId);
          if (!market || market.status === 'resolved' || market.status === 'cancelled') return;

          const pUpdates: Record<string, number> = {};
          let newJackpot = state.jackpot;

          if (winnerPlayerIds.length > 0) {
            // Split jackpot equally among winners
            const prize = Math.floor(state.jackpot / winnerPlayerIds.length);
            winnerPlayerIds.forEach(pid => { pUpdates[pid] = prize; });
            newJackpot = Math.max(0, state.jackpot - prize * winnerPlayerIds.length);
          }
          // No winners → jackpot stays unchanged

          set(s => ({
            jackpot: newJackpot,
            markets: s.markets.map(m => m.id === marketId
              ? { ...m, status: 'resolved', winningOptionId: winnerPlayerIds.join(',') || null, resolutionType: 'normal' }
              : m),
            players: s.players.map(p => pUpdates[p.id] ? { ...p, tokens: p.tokens + pUpdates[p.id] } : p),
          }));

          if (db) {
            const batch = writeBatch(db);
            batch.update(doc(db, 'markets', marketId), {
              status: 'resolved',
              winningOptionId: winnerPlayerIds.join(',') || null,
              resolutionType: 'normal',
            });
            batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
            Object.entries(pUpdates).forEach(([pid, amt]) => {
              const p = state.players.find(pl => pl.id === pid);
              if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt });
            });
            await batch.commit();
          }
        },

        submitAnswer: async (marketId, text) => {
          const state = get();
          if (!state.currentUser) return;
          const answer: Answer = { id: Math.random().toString(36).substring(7), marketId, playerId: state.currentUser, text: text.trim(), timestamp: Date.now() };
          set(s => ({ answers: [...s.answers, answer] }));
          if (db) await setDoc(doc(db, 'answers', answer.id), answer);
        },

        createMarket: async (marketData) => {
          const m: Market = { ...marketData, id: Math.random().toString(36).substring(7), createdAt: Date.now(), winningOptionId: null, resolutionType: null };
          set(s => ({ markets: [...s.markets, m] }));
          if (db) await setDoc(doc(db, 'markets', m.id), m);
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
            const batch = writeBatch(db);
            batch.update(doc(db, 'markets', marketId), { status: 'resolved', winningOptionId: null, resolutionType: 'rollover' });
            batch.set(doc(db, 'appState', 'global'), { jackpot: newJackpot }, { merge: true });
            Object.entries(pUpdates).forEach(([pid, amt]) => { const p = state.players.find(pl => pl.id === pid); if (p) batch.update(doc(db, 'players', pid), { tokens: p.tokens + amt }); });
            await batch.commit();
          }
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

        resetState: () => { clearSessionCookie(); set({ players: INITIAL_PLAYERS, markets: INITIAL_MARKETS, bets: [], answers: [], jackpot: 0, currentUser: null }); },
      };
    },
    {
      name: 'betpanda-storage',
      // Only persist data, not functions
      partialize: (state) => ({
        players: state.players,
        markets: state.markets,
        bets: state.bets,
        answers: state.answers,
        jackpot: state.jackpot,
        currentUser: state.currentUser,
      }),
    }
  )
);