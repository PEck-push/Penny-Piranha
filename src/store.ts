import { create } from 'zustand';

export type Badge = 'MARKET MOVER' | 'THE WHALE' | 'BANKROTT' | 'STREAK';

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
  poolYes: number;
  poolNo: number;
  createdAt: number;
  expiresAt?: number;
  createdBy: string;
  comboMarketIds?: string[];
  comboMultiplier?: number;
}

export interface Bet {
  id: string;
  marketId: string;
  playerId: string;
  side: 'yes' | 'no';
  amount: number;
  comboId?: string;
  timestamp: number;
}

interface AppState {
  players: Player[];
  markets: Market[];
  bets: Bet[];
  jackpot: number;
  currentUser: string | null;
  isAdmin: boolean;
  
  login: (playerId: string, avatar: string, avatarColor: string) => void;
  logout: () => void;
  setAdmin: (isAdmin: boolean) => void;
  placeBet: (marketId: string, side: 'yes' | 'no', amount: number) => void;
  createMarket: (market: Omit<Market, 'id' | 'poolYes' | 'poolNo' | 'createdAt'>) => void;
  resolveMarket: (marketId: string, winningSide: 'yes' | 'no') => void;
  resolveRollover: (marketId: string) => void;
  resolveStorno: (marketId: string) => void;
  lockMarket: (marketId: string) => void;
  giveTokens: (playerId: string, amount: number) => void;
}

const INITIAL_PLAYERS: Player[] = [
  { id: 'p1', name: 'Alex', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p2', name: 'Neigi', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p3', name: 'Michi', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p4', name: 'Steindl', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p5', name: 'Paco', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p6', name: 'Luigi', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p7', name: 'Stefan', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p8', name: 'Jakob', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p9', name: 'Philipp', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p10', name: 'Memo', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
  { id: 'p11', name: 'Moz', avatar: '', avatarColor: '', tokens: 1000, comboMalus: false, badges: [] },
];

const INITIAL_MARKETS: Market[] = [
  {
    id: 'm1',
    question: 'Gewinnt Max das nächste Mario Kart Rennen?',
    type: 'standard',
    status: 'open',
    poolYes: 120,
    poolNo: 80,
    createdAt: Date.now() - 100000,
    createdBy: 'admin',
  },
  {
    id: 'm2',
    question: 'Wird Jonas beim nächsten Runde Bier bestellen?',
    type: 'hot-take',
    status: 'open',
    poolYes: 60,
    poolNo: 24,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
    createdBy: 'admin',
  },
  {
    id: 'm3',
    question: 'Wer hat heimlich Käsebrot mitgebracht?',
    type: 'anonymous',
    status: 'open',
    poolYes: 45,
    poolNo: 55,
    createdAt: Date.now() - 200000,
    createdBy: 'admin',
  }
];

const INITIAL_BETS: Bet[] = [
  { id: 'b1', marketId: 'm1', playerId: 'p3', side: 'yes', amount: 50, timestamp: Date.now() },
  { id: 'b2', marketId: 'm1', playerId: 'p7', side: 'yes', amount: 50, timestamp: Date.now() },
  { id: 'b3', marketId: 'm1', playerId: 'p4', side: 'yes', amount: 20, timestamp: Date.now() },
  { id: 'b4', marketId: 'm1', playerId: 'p5', side: 'no', amount: 60, timestamp: Date.now() },
  { id: 'b5', marketId: 'm1', playerId: 'p10', side: 'no', amount: 20, timestamp: Date.now() },
];

export const useStore = create<AppState>((set) => ({
  players: INITIAL_PLAYERS,
  markets: INITIAL_MARKETS,
  bets: INITIAL_BETS,
  jackpot: 38,
  currentUser: null,
  isAdmin: false,

  login: (playerId, avatar, avatarColor) => set((state) => ({ 
    currentUser: playerId,
    players: state.players.map(p => p.id === playerId ? { ...p, avatar, avatarColor } : p)
  })),
  logout: () => set({ currentUser: null, isAdmin: false }),
  setAdmin: (isAdmin) => set({ isAdmin }),

  placeBet: (marketId, side, amount) => set((state) => {
    if (!state.currentUser) return state;
    
    const player = state.players.find(p => p.id === state.currentUser);
    if (!player || player.tokens < amount) return state;

    const newBet: Bet = {
      id: Math.random().toString(36).substring(7),
      marketId,
      playerId: state.currentUser,
      side,
      amount,
      timestamp: Date.now(),
    };

    return {
      bets: [...state.bets, newBet],
      players: state.players.map(p => 
        p.id === state.currentUser ? { ...p, tokens: p.tokens - amount } : p
      ),
      markets: state.markets.map(m => 
        m.id === marketId 
          ? { ...m, poolYes: m.poolYes + (side === 'yes' ? amount : 0), poolNo: m.poolNo + (side === 'no' ? amount : 0) }
          : m
      )
    };
  }),

  createMarket: (marketData) => set((state) => ({
    markets: [...state.markets, {
      ...marketData,
      id: Math.random().toString(36).substring(7),
      poolYes: 0,
      poolNo: 0,
      createdAt: Date.now(),
    }]
  })),

  resolveMarket: (marketId, winningSide) => set((state) => {
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved') return state;

    const totalPool = market.poolYes + market.poolNo;
    const winningPool = winningSide === 'yes' ? market.poolYes : market.poolNo;
    
    const marketBets = state.bets.filter(b => b.marketId === marketId);
    const winningBets = marketBets.filter(b => b.side === winningSide);

    const playerUpdates: Record<string, number> = {};
    let newJackpot = state.jackpot;
    
    // EDGE CASE: Kein Gewinner (winPool === 0)
    if (winningPool === 0) {
      let totalRefunded = 0;
      marketBets.forEach(bet => {
        const refund = Math.floor(bet.amount * 0.5);
        playerUpdates[bet.playerId] = (playerUpdates[bet.playerId] || 0) + refund;
        totalRefunded += refund;
      });
      newJackpot += (totalPool - totalRefunded);
    } 
    // EDGE CASE: Alle auf Gewinnerseite (winPool === totalPool)
    else if (winningPool === totalPool) {
      let totalPaid = 0;
      winningBets.forEach(bet => {
        const jackpotShare = state.jackpot > 0 ? Math.floor((bet.amount / winningPool) * state.jackpot) : 0;
        const payout = bet.amount + jackpotShare;
        playerUpdates[bet.playerId] = (playerUpdates[bet.playerId] || 0) + payout;
        totalPaid += payout;
      });
      newJackpot = Math.max(0, state.jackpot - (totalPaid - winningPool));
    }
    // NORMALE AUSZAHLUNG
    else {
      const effectiveTotal = totalPool + state.jackpot;
      let totalPaid = 0;
      winningBets.forEach(bet => {
        const payout = Math.floor((bet.amount / winningPool) * effectiveTotal);
        playerUpdates[bet.playerId] = (playerUpdates[bet.playerId] || 0) + payout;
        totalPaid += payout;
      });
      newJackpot = effectiveTotal - totalPaid; // Remainder -> Jackpot
    }

    return {
      jackpot: newJackpot,
      markets: state.markets.map(m => m.id === marketId ? { ...m, status: 'resolved' } : m),
      players: state.players.map(p => {
        if (playerUpdates[p.id]) {
          return { ...p, tokens: p.tokens + playerUpdates[p.id] };
        }
        return p;
      })
    };
  }),

  resolveRollover: (marketId: string) => set((state) => {
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved') return state;

    const marketBets = state.bets.filter(b => b.marketId === marketId);
    const playerUpdates: Record<string, number> = {};
    let totalRefunded = 0;

    marketBets.forEach(bet => {
      const refund = Math.floor(bet.amount * 0.5);
      playerUpdates[bet.playerId] = (playerUpdates[bet.playerId] || 0) + refund;
      totalRefunded += refund;
    });

    const totalPool = market.poolYes + market.poolNo;
    const newJackpot = state.jackpot + (totalPool - totalRefunded);

    return {
      jackpot: newJackpot,
      markets: state.markets.map(m => m.id === marketId ? { ...m, status: 'resolved' } : m),
      players: state.players.map(p => {
        if (playerUpdates[p.id]) {
          return { ...p, tokens: p.tokens + playerUpdates[p.id] };
        }
        return p;
      })
    };
  }),

  resolveStorno: (marketId: string) => set((state) => {
    const market = state.markets.find(m => m.id === marketId);
    if (!market || market.status === 'resolved') return state;

    const marketBets = state.bets.filter(b => b.marketId === marketId);
    const playerUpdates: Record<string, number> = {};

    marketBets.forEach(bet => {
      playerUpdates[bet.playerId] = (playerUpdates[bet.playerId] || 0) + bet.amount;
    });

    return {
      markets: state.markets.map(m => m.id === marketId ? { ...m, status: 'cancelled' } : m),
      players: state.players.map(p => {
        if (playerUpdates[p.id]) {
          return { ...p, tokens: p.tokens + playerUpdates[p.id] };
        }
        return p;
      })
    };
  }),

  lockMarket: (marketId) => set((state) => ({
    markets: state.markets.map(m => m.id === marketId ? { ...m, status: 'locked' } : m)
  })),

  giveTokens: (playerId, amount) => set((state) => ({
    players: state.players.map(p => p.id === playerId ? { ...p, tokens: p.tokens + amount } : p)
  })),
}));
