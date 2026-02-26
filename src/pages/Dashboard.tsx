import { useState, useEffect } from 'react';
import { useStore, Market, getMarketTotal } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, Trophy, Lock } from 'lucide-react';

const OPT_HEX    = ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'];
const OPT_TEXT   = ['text-green','text-red','text-blue2','text-yellow','text-purple2'];
const OPT_BG     = ['bg-green/10','bg-red/10','bg-blue/10','bg-yellow/10','bg-purple/10'];
const OPT_BORDER = ['border-green/35','border-red/35','border-blue2/35','border-yellow/35','border-purple2/35'];
const OPT_HOVER  = ['hover:bg-green/15','hover:bg-red/15','hover:bg-blue/15','hover:bg-yellow/15','hover:bg-purple/15'];
const OPT_SHADOW = ['shadow-[0_8px_32px_rgba(0,214,143,0.35)]','shadow-[0_8px_32px_rgba(255,61,90,0.35)]','shadow-[0_8px_32px_rgba(59,110,255,0.35)]','shadow-[0_8px_32px_rgba(255,212,71,0.35)]','shadow-[0_8px_32px_rgba(139,61,255,0.35)]'];

function calcPayout(market: Market, optionId: string, betAmt: number, jackpot: number): number {
  const opt = market.options.find(o => o.id === optionId);
  if (!opt) return 0;
  if (market.type === 'combo') return betAmt * (market.multiplier ?? 3);
  const simOpt = opt.pool + betAmt;
  const simTotal = getMarketTotal(market) + betAmt + jackpot;
  return simOpt === 0 ? 0 : Math.floor((betAmt / simOpt) * simTotal);
}

function PoolBar({ market }: { market: Market }) {
  const total = getMarketTotal(market) || 1;
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5 flex-wrap gap-x-2">
        {market.options.map((opt, i) => (
          <span key={opt.id} className={clsx('font-mono text-[12px] font-bold', OPT_TEXT[i])}>
            {opt.label} {Math.round((opt.pool / total) * 100)}%
          </span>
        ))}
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-white/5">
        {market.options.map((opt, i) => (
          <div key={opt.id} className="h-full transition-all duration-500" style={{ width: `${(opt.pool / total) * 100}%`, backgroundColor: OPT_HEX[i] }} />
        ))}
      </div>
    </div>
  );
}

// ── Countdown hook ──────────────────────────────────────────────────────────────
function useCountdown(expiresAt?: number): { remaining: number; expired: boolean; label: string } {
  const [remaining, setRemaining] = useState(expiresAt ? Math.max(0, expiresAt - Date.now()) : 0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, expiresAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const expired = expiresAt ? remaining <= 0 : false;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const label = expired ? 'ABGELAUFEN' : `${mins}:${secs.toString().padStart(2, '0')}`;
  return { remaining, expired, label };
}

// ── Hot Take Card with live countdown ──────────────────────────────────────────
function HotTakeCard({ m, onClick, myBet }: { m: Market; onClick: () => void; myBet: { amount: number; optionLabel: string } | undefined }) {
  const { expired, label } = useCountdown(m.expiresAt);
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">⚡ Hot Take</span>
        <div className={clsx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black", expired ? "bg-red/15 border border-red/30 text-red" : "bg-blue/10 border border-blue2/30 text-blue2")}>
          {expired ? '🔒 ABGELAUFEN' : `⏱ ${label}`}
        </div>
      </div>
      <div onClick={expired ? undefined : onClick}
        className={clsx("bg-card border-[1.5px] rounded-[18px] p-4 relative overflow-hidden",
          expired ? "border-border opacity-60 cursor-not-allowed" : "border-blue2/50 shadow-[0_0_30px_rgba(59,110,255,0.1)] cursor-pointer hover:shadow-[0_0_40px_rgba(59,110,255,0.2)]")}>
        <div className={clsx("absolute top-0 left-0 right-0 h-[2px]", expired ? "bg-red/50" : "bg-gradient-to-r from-blue via-purple to-cyan bg-[length:200%] animate-[hts_2s_linear_infinite]")} />
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue/20 to-purple/20 border border-blue2/40 rounded-full px-3 py-1 text-[10px] font-black text-blue2 tracking-[0.1em] w-fit mb-2.5">⚡ HOT TAKE</div>
        <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
        <PoolBar market={m} />
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Pool: <b className="text-white">{getMarketTotal(m)} TKN</b></span>
          {expired
            ? <span className="text-[11px] text-red/60 font-black">Keine Wetten mehr möglich</span>
            : myBet
              ? <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
              : <span className="text-[11px] text-muted">Noch kein Einsatz</span>
          }
        </div>
      </div>
    </div>
  );
}

// ── Combo Market Card ───────────────────────────────────────────────────────────
function ComboCard({ m, onClick, myBet }: { m: Market; onClick: () => void; myBet: { amount: number; optionLabel: string } | undefined }) {
  const pendingLegs = m.comboLegs?.filter(l => l.status === 'pending').length ?? 0;
  const hitLegs = m.comboLegs?.filter(l => l.status === 'hit').length ?? 0;
  const anyMiss = m.comboLegs?.some(l => l.status === 'miss');
  return (
    <div onClick={onClick} className="bg-card border border-purple2/40 rounded-[18px] p-4 mb-2.5 cursor-pointer relative overflow-hidden hover:border-purple2/70 transition-all hover:-translate-y-0.5">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple via-purple2 to-blue" />
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[10px] font-black text-purple2 bg-purple/15 border border-purple2/30 rounded-full px-2.5 py-1 tracking-[0.1em]">🔗 COMBO {m.multiplier}×</span>
        {anyMiss && <span className="text-[10px] font-black text-red bg-red/10 border border-red/25 rounded-full px-2 py-1">✗ GESCHEITERT</span>}
        {!anyMiss && hitLegs > 0 && <span className="text-[10px] font-black text-green bg-green/10 border border-green/25 rounded-full px-2 py-1">{hitLegs}/{m.comboLegs?.length} ✓</span>}
      </div>
      <div className="text-[15px] font-black text-white leading-[1.3] mb-3">{m.question}</div>
      {m.comboLegs?.map((leg, i) => (
        <div key={i} className="flex items-center gap-2 mb-1.5">
          <span className={clsx("text-[11px] font-black w-4 text-center", leg.status === 'hit' ? 'text-green' : leg.status === 'miss' ? 'text-red' : 'text-muted')}>
            {leg.status === 'hit' ? '✓' : leg.status === 'miss' ? '✗' : '○'}
          </span>
          <span className="text-[12px] text-muted flex-1 truncate">{leg.marketQuestion}</span>
          <span className="text-[11px] font-black text-white shrink-0">→ {leg.predictedOptionLabel}</span>
        </div>
      ))}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border">
        <span className="text-[12px] text-muted">Pool: <b className="text-white">{getMarketTotal(m)} TKN</b></span>
        {myBet
          ? <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
          : <span className="text-[11px] text-purple2 font-black">Einsatz möglich → {m.multiplier}×</span>
        }
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'my-bets' | 'leaderboard'>('dashboard');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [betAmount, setBetAmount] = useState(20);
  const [confirmBet, setConfirmBet] = useState<{ optionId: string; optionLabel: string; amount: number } | null>(null);
  const [openAnswerText, setOpenAnswerText] = useState('');
  const [answerSubmitted, setAnswerSubmitted] = useState(false);

  const navigate = useNavigate();
  const currentUser = useStore(s => s.currentUser);
  const players = useStore(s => s.players);
  const markets = useStore(s => s.markets);
  const bets = useStore(s => s.bets);
  const answers = useStore(s => s.answers);
  const jackpot = useStore(s => s.jackpot);
  const placeBet = useStore(s => s.placeBet);
  const logout = useStore(s => s.logout);
  const submitAnswer = useStore(s => s.submitAnswer);
  const me = players.find(p => p.id === currentUser);

  const { expired: selectedExpired } = useCountdown(selectedMarket?.expiresAt);

  // Tick every second so the ticker re-evaluates when a Hot Take expires
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleBet = (optionId: string, optionLabel: string) => {
    if (selectedMarket && me && me.tokens >= betAmount && !selectedExpired)
      setConfirmBet({ optionId, optionLabel, amount: betAmount });
  };

  const executeBet = () => {
    if (selectedMarket && me && confirmBet && me.tokens >= confirmBet.amount) {
      placeBet(selectedMarket.id, confirmBet.optionId, confirmBet.optionLabel, confirmBet.amount);
      setConfirmBet(null);
      setSelectedMarket(null);
    }
  };

  const handleSubmitOpenAnswer = () => {
    if (!selectedMarket || !openAnswerText.trim()) return;
    submitAnswer(selectedMarket.id, openAnswerText.trim());
    setAnswerSubmitted(true);
    setOpenAnswerText('');
    setTimeout(() => { setAnswerSubmitted(false); setSelectedMarket(null); }, 1500);
  };

  const openMarketModal = (m: Market) => {
    setSelectedMarket(m);
    setOpenAnswerText('');
    setAnswerSubmitted(false);
  };

  if (!me) return null;

  const openMarketsCount = markets.filter(m => m.status === 'open').length;
  const hasActiveHotTake = markets.some(m => m.type === 'hot-take' && m.status === 'open' && !(m.expiresAt && now > m.expiresAt));
  const tickerItems = [
    `🟢 LIVE — ${openMarketsCount} Märkte offen`,
    ...(hasActiveHotTake ? ['⚡ HOT TAKE läuft'] : []),
    `🎰 Jackpot: ${jackpot} TKN`,
  ];
  const tickerContent = [...tickerItems, ...tickerItems];

  // ─── DASHBOARD TAB ─────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">

      {/* Hot Takes */}
      {markets.filter(m => m.type === 'hot-take' && m.status === 'open').map(m => (
        <HotTakeCard key={m.id} m={m} onClick={() => openMarketModal(m)} myBet={bets.find(b => b.marketId === m.id && b.playerId === me.id)} />
      ))}

      {/* Combos */}
      {markets.filter(m => m.type === 'combo' && m.status === 'open').length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">🔗 Combo-Wetten</span>
            <span className="text-[12px] font-bold text-purple2">{markets.filter(m => m.type === 'combo' && m.status === 'open').length} aktiv</span>
          </div>
          {markets.filter(m => m.type === 'combo' && m.status === 'open').map(m => (
            <ComboCard key={m.id} m={m} onClick={() => openMarketModal(m)} myBet={bets.find(b => b.marketId === m.id && b.playerId === me.id)} />
          ))}
        </>
      )}

      {/* Standard */}
      <div className="flex items-center justify-between mb-2.5 mt-1">
        <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">Aktive Märkte</span>
        <span className="text-[12px] font-bold text-blue2">{markets.filter(m => m.type === 'standard' && m.status === 'open').length} offen</span>
      </div>
      {markets.filter(m => m.type === 'standard' && m.status === 'open').map(m => {
        const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
        return (
          <div key={m.id} onClick={() => openMarketModal(m)} className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer transition-all hover:border-blue/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue2/40 to-transparent" />
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_6px_rgba(0,214,143,1)] animate-[puls_1.5s_infinite]" />
              <span className="text-[10px] font-extrabold text-muted tracking-[0.1em]">Standard</span>
            </div>
            <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
            <PoolBar market={m} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">Pool: <b className="text-white">{getMarketTotal(m)} TKN</b></span>
              {myBet
                ? <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
                : <span className="text-[11px] text-muted">Noch kein Einsatz</span>}
            </div>
          </div>
        );
      })}

      {/* Anonymous */}
      {markets.filter(m => m.type === 'anonymous' && m.status === 'open').length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">[?] Anonym</span>
          </div>
          {markets.filter(m => m.type === 'anonymous' && m.status === 'open').map(m => {
            const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
            const myAnswer = answers.find(a => a.marketId === m.id && a.playerId === me.id);
            const participated = myBet || myAnswer;
            const count = m.isOpenQuestion ? answers.filter(a => a.marketId === m.id).length : bets.filter(b => b.marketId === m.id).length;
            return (
              <div key={m.id} onClick={() => openMarketModal(m)} className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer">
                <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 mb-2.5 text-[10px] font-extrabold text-muted tracking-[0.1em]">
                  {m.isOpenQuestion ? '✏️ OFFENE FRAGE · anonym' : '🕵️ ANONYM · Reveal nach Schluss'}
                </div>
                <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
                {!m.isOpenQuestion && <PoolBar market={m} />}
                <div className="flex items-center justify-between mt-1">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-mono">[?]</div>)}
                    <div className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-mono">+{count}</div>
                  </div>
                  {participated && (
                    <span className="text-[11px] font-black text-green bg-green/10 border border-green/20 rounded-lg px-2 py-1">
                      {m.isOpenQuestion ? '✓ Geantwortet' : `🪙 ${myBet?.amount} auf ${myBet?.optionLabel}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {openMarketsCount === 0 && (
        <div className="flex flex-col items-center gap-3 mt-12 text-center px-6">
          <div className="text-[48px]">🎲</div>
          <div className="text-[16px] font-black text-muted">Noch keine Märkte offen</div>
          <div className="text-[12px] text-muted/60">Der Admin kann neue Märkte erstellen</div>
        </div>
      )}
    </div>
  );

  // ─── MY BETS TAB ───────────────────────────────────────────────────────────
  const renderMyBets = () => {
    const myBets = bets.filter(b => b.playerId === me.id);
    const active = myBets.filter(b => { const m = markets.find(m => m.id === b.marketId); return m && (m.status === 'open' || m.status === 'locked'); });
    const resolved = myBets.filter(b => { const m = markets.find(m => m.id === b.marketId); return m && (m.status === 'resolved' || m.status === 'cancelled'); });
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">
        <div className="text-[22px] font-black text-white mb-4">Meine Wetten 🎯</div>
        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5">Aktiv</div>
        {active.length === 0 ? <div className="text-[12px] text-muted mb-6">Keine aktiven Wetten</div> : active.map(b => {
          const m = markets.find(m => m.id === b.marketId);
          if (!m) return null;
          const opt = m.options.find(o => o.id === b.optionId);
          const optIdx = m.options.findIndex(o => o.id === b.optionId);
          const potWin = calcPayout(m, b.optionId, b.amount, jackpot);
          return (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px]">{m.type === 'combo' ? '🔗' : '▶'}</span>
                <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                <span className={clsx('text-[11px] font-black px-2 py-0.5 rounded-md', OPT_BG[optIdx], OPT_TEXT[optIdx])}>{opt?.label}</span>
              </div>
              <div className="text-[12px] text-muted flex justify-between">
                <span>Einsatz: <b className="text-white">{b.amount} TKN</b></span>
                <span>Möglicher Gewinn: <b className="text-yellow">~{potWin} TKN</b></span>
              </div>
            </div>
          );
        })}
        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5 mt-6">Abgeschlossen</div>
        {resolved.length === 0 ? <div className="text-[12px] text-muted mb-6">Noch keine abgeschlossenen Wetten</div> : resolved.map(b => {
          const m = markets.find(m => m.id === b.marketId);
          if (!m) return null;
          const optIdx = m.options.findIndex(o => o.id === b.optionId);
          const isWin = m.status === 'resolved' && m.winningOptionId === b.optionId;
          const isStorno = m.status === 'cancelled';
          const isRollover = m.status === 'resolved' && m.resolutionType === 'rollover';
          let resultText = '', resultClass = '', resultAmt = '';
          if (isStorno) { resultText = 'STORNO'; resultClass = 'text-muted'; resultAmt = `+${b.amount} TKN`; }
          else if (isRollover) { resultText = 'ROLLOVER'; resultClass = 'text-purple2'; resultAmt = `+${Math.floor(b.amount * 0.5)} TKN`; }
          else if (isWin) {
            resultText = 'WON ✓'; resultClass = 'text-green';
            if (m.type === 'combo') { resultAmt = `+${b.amount * (m.multiplier ?? 3)} TKN`; }
            else { const wOpt = m.options.find(o => o.id === b.optionId); resultAmt = `+${wOpt ? Math.floor((b.amount / wOpt.pool) * getMarketTotal(m)) : 0} TKN`; }
          } else { resultText = 'LOST ✗'; resultClass = 'text-red'; resultAmt = `-${b.amount} TKN`; }
          return (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px]">{m.type === 'combo' ? '🔗' : '▶'}</span>
                <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                <span className={clsx('text-[11px] font-black px-2 py-0.5 rounded-md', OPT_BG[optIdx] ?? OPT_BG[0], OPT_TEXT[optIdx] ?? OPT_TEXT[0])}>{b.optionLabel}</span>
              </div>
              <div className="text-[12px] text-muted flex justify-between">
                <span>Einsatz: <b className="text-white">{b.amount} TKN</b></span>
                <span className={clsx('font-bold', resultClass)}>{resultText} <span className="font-mono">{resultAmt}</span></span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── LEADERBOARD TAB ───────────────────────────────────────────────────────
  const renderLeaderboard = () => {
    const sorted = [...players].sort((a, b) => b.tokens - a.tokens);
    const top = sorted[0];
    return (
      <div className="flex-1 flex flex-col relative z-10">
        <div className="relative z-30 px-5 pt-3.5 flex items-center justify-between shrink-0">
          <div className="text-[22px] font-black text-white">Rangliste 🏆</div>
          <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
            <span className="text-[10px] font-extrabold text-yellow/50">JACKPOT</span>
            <span className="font-mono text-[12px] font-bold text-yellow">🎰 {jackpot}</span>
          </div>
        </div>
        <div className="relative z-20 h-[250px] shrink-0 flex flex-col items-center justify-end overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,rgba(255,212,71,.22)_0%,transparent_65%)]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[260px] h-[70px] rounded-full bg-yellow/35 blur-[32px]" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[28px] z-40 animate-[crownBob_2s_ease-in-out_infinite]">👑</div>
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {top?.avatar ? <img src={top.avatar} alt={top.name} className="w-[180px] h-[180px] object-contain" /> : <div className="w-[180px] h-[180px] rounded-full bg-white/5" />}
          </div>
          <div className="relative z-30 flex flex-col items-center mt-[120px] mb-3.5">
            <div className="flex items-center gap-2.5 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1 backdrop-blur-md">
              <div className="text-[20px] font-black text-white">{top?.name}</div>
              <div className="bg-gradient-to-br from-yellow to-orange text-bg font-mono text-[11px] font-bold rounded-lg px-2.5 py-1">#1</div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-md">
              <span className="font-mono text-[18px] font-bold text-yellow">🪙 {top?.tokens}</span>
              <span className="text-[12px] text-yellow/60 font-bold">TOKEN</span>
            </div>
          </div>
        </div>
        <div className="relative z-20 flex gap-2 px-4 pb-2.5 shrink-0">
          {sorted[1] && (
            <div className="flex-1 bg-card border border-[#C0C0DC]/30 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C8C8F0]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#C8C8F0] bg-[#C8C8F0]/10 border border-[#C8C8F0]/25">#2 🥈</div>
              <div className="w-9 h-9">{sorted[1].avatar ? <img src={sorted[1].avatar} alt={sorted[1].name} className="w-full h-full object-cover rounded-full" /> : <div className="w-full h-full rounded-full bg-white/5" />}</div>
              <div className="text-[14px] font-black text-white text-center">{sorted[1].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sorted[1].tokens} TKN</div>
            </div>
          )}
          {sorted[2] && (
            <div className="flex-1 bg-card border border-[#CD7F32]/35 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CD7F32]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#CD7F32] bg-[#CD7F32]/10 border border-[#CD7F32]/25">#3 🥉</div>
              <div className="w-9 h-9">{sorted[2].avatar ? <img src={sorted[2].avatar} alt={sorted[2].name} className="w-full h-full object-cover rounded-full" /> : <div className="w-full h-full rounded-full bg-white/5" />}</div>
              <div className="text-[14px] font-black text-white text-center">{sorted[2].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sorted[2].tokens} TKN</div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px] pt-1 relative z-10">
          {sorted.slice(3).map((p, i) => (
            <div key={p.id} className={clsx("flex items-center gap-3 bg-card border rounded-[14px] p-3 mb-1.5 relative",
              p.id === me.id ? "border-green/40 bg-green/5" : "border-border hover:border-blue/30", p.tokens === 0 && "border-red/25")}>
              {p.id === me.id && <div className="absolute left-0 top-1/5 bottom-1/5 w-[3px] rounded-r-sm bg-green shadow-[0_0_10px_rgba(0,214,143,1)]" />}
              <div className={clsx("font-mono text-[14px] font-bold w-6 text-center", p.id === me.id ? "text-yellow" : p.tokens === 0 ? "text-red" : "text-muted")}>#{i+4}</div>
              <div className="w-9 h-9 rounded-lg bg-input flex items-center justify-center border border-border shrink-0 overflow-hidden">
                {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-black text-white">{p.name} {p.id === me.id && <span className="text-[10px] text-green font-black">(Du)</span>}</div>
              </div>
              <span className={clsx("font-mono text-[15px] font-bold", p.tokens === 0 ? "text-red" : "text-white")}>{p.tokens}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {activeTab === 'dashboard'
        ? <div className="absolute top-0 left-0 right-0 h-[290px] z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,110,255,.35)_0%,transparent_60%)]" />
        : <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,212,71,.18)_0%,transparent_40%)]" />
      }

      {/* Top Bar */}
      {activeTab === 'dashboard' && (
        <div className="relative z-30 px-5 pt-2.5 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-green rounded-full flex items-center justify-center text-[11px] shadow-[0_0_12px_rgba(0,214,143,0.5)]">🐼</div>
              <span className="text-[13px] font-black text-white">Betpanda</span>
            </div>
            <div className="text-[11px] text-muted mt-[1px]">Hey, <b className="text-green">{me.name}</b></div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
              <span className="text-[14px]">🎰</span>
              <span className="font-mono text-[11px] font-bold text-yellow">{jackpot} TKN</span>
            </div>
            <button
              onClick={() => { logout(); navigate('/'); }}
              title="Charakter wechseln"
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors text-[14px]"
            >👤</button>
            <button onClick={() => navigate('/admin')} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors">
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      {activeTab === 'dashboard' && (
        <div className="relative z-20 h-[290px] flex flex-col items-center shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(59,110,255,.25)_0%,transparent_65%)] animate-[flareMove_15s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] h-[80px] rounded-full bg-blue/30 blur-[35px]" />
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {me.avatar ? <img src={me.avatar} alt={me.name} className="w-[200px] h-[200px] object-contain" /> : <div className="w-[200px] h-[200px] rounded-full bg-white/5" />}
          </div>
          <div className="relative z-30 flex flex-col items-center gap-3 mt-[220px]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Konto</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-white">{me.tokens + bets.filter(b => b.playerId === me.id && markets.find(m => m.id === b.marketId)?.status === 'open').reduce((s,b)=>s+b.amount,0)}</span>
                </div>
              </div>
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Frei</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-green">{me.tokens}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticker */}
      {activeTab === 'dashboard' && openMarketsCount > 0 && (
        <div className="bg-gradient-to-r from-blue via-purple to-blue bg-[length:200%_100%] animate-[gradMove_4s_linear_infinite] py-1.5 overflow-hidden shrink-0 relative z-30">
          <div className="flex gap-12 animate-[tick_20s_linear_infinite] w-max">
            {tickerContent.map((item, i) => (
              <span key={i} className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">{item}</span>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'my-bets' && renderMyBets()}
      {activeTab === 'leaderboard' && renderLeaderboard()}

      {/* Bottom Nav */}
      <div className="bg-[#050912]/95 backdrop-blur-xl border-t border-border px-2 pb-3 shrink-0 sticky bottom-0 z-40">
        <div className="grid grid-cols-3">
          {([['dashboard','Dashboard',LayoutDashboard],['my-bets','My Bets',Target],['leaderboard','Ranking',Trophy]] as const).map(([tab,label,Icon]) => (
            <div key={tab} onClick={() => setActiveTab(tab)} className="flex flex-col items-center px-2 pt-3 pb-3 gap-1.5 cursor-pointer relative">
              <Icon className={clsx("w-6 h-6", activeTab === tab ? "text-green" : "text-muted")} strokeWidth={2} />
              <span className={clsx("text-[10px] font-black tracking-[0.08em] uppercase", activeTab === tab ? "text-green" : "text-muted")}>{label}</span>
              {activeTab === tab && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-sm bg-green shadow-[0_0_10px_rgba(0,214,143,0.5)]" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── BET MODAL ─────────────────────────────────────────────────────────── */}
      {selectedMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-3 py-4">
          <div className="bg-bg rounded-[28px] flex flex-col relative overflow-hidden border border-border shadow-[0_20px_60px_rgba(0,0,0,0.7)] w-full max-w-[430px] max-h-[90vh]">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_-5%,rgba(0,214,143,.2)_0%,transparent_50%)]" />
            <div className="relative z-10 flex flex-col">
              

              {/* Header */}
              <div className="p-4 px-5 border-b border-border flex justify-between items-start shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">
                    {selectedMarket.type === 'combo' ? `🔗 COMBO · ${selectedMarket.multiplier}× Multiplikator` : `${selectedMarket.type} · Markt`}
                  </div>
                  <div className="text-[18px] font-black text-white leading-[1.2]">{selectedMarket.question}</div>
                </div>
                <button onClick={() => setSelectedMarket(null)} className="text-muted hover:text-white p-2 shrink-0">✕</button>
              </div>

              {/* ── OPEN QUESTION ──────────────────────────────────── */}
              {selectedMarket.isOpenQuestion ? (
                <div className="p-4 px-5 pb-7">
                  {answerSubmitted ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="text-[48px]">✅</div>
                      <div className="text-[16px] font-black text-green">Antwort eingereicht!</div>
                    </div>
                  ) : answers.find(a => a.marketId === selectedMarket.id && a.playerId === me.id) ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="text-[48px]">🕵️</div>
                      <div className="text-[16px] font-black text-muted">Bereits geantwortet</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Deine anonyme Antwort</div>
                      <textarea value={openAnswerText} onChange={e => setOpenAnswerText(e.target.value)} placeholder="Schreib deine Antwort hier… (anonym)" rows={3}
                        className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-purple2 placeholder:text-muted resize-none mb-3" />
                      <button onClick={handleSubmitOpenAnswer} disabled={!openAnswerText.trim()}
                        className="w-full p-3.5 rounded-xl bg-gradient-to-br from-purple to-purple2 font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(139,61,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">
                        🕵️ Anonym einreichen
                      </button>
                    </>
                  )}
                </div>
              ) : (
                /* ── REGULAR / COMBO BET ──────────────────────────── */
                <div className="overflow-y-auto no-scrollbar">
                  {/* Combo Legs */}
                  {selectedMarket.type === 'combo' && selectedMarket.comboLegs && (
                    <div className="p-4 px-5 border-b border-border">
                      <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Legs</div>
                      {selectedMarket.comboLegs.map((leg, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1.5 bg-input rounded-xl p-2 px-3">
                          <span className={clsx("text-[11px] font-black w-4 text-center", leg.status === 'hit' ? 'text-green' : leg.status === 'miss' ? 'text-red' : 'text-muted')}>
                            {leg.status === 'hit' ? '✓' : leg.status === 'miss' ? '✗' : `${i+1}`}
                          </span>
                          <span className="text-[12px] text-white flex-1 truncate">{leg.marketQuestion}</span>
                          <span className="text-[11px] font-black text-green shrink-0">→ {leg.predictedOptionLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pool */}
                  <div className="p-4 px-5 border-b border-border">
                    <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Pool-Verteilung</div>
                    <div className="h-3 rounded-full overflow-hidden flex mb-2.5">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500" style={{ width: `${(opt.pool / (getMarketTotal(selectedMarket)||1))*100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-between">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="flex flex-col gap-0.5">
                          <span className={clsx('font-mono text-[13px] font-bold', OPT_TEXT[i])}>{opt.pool} TKN</span>
                          <span className="text-[10px] text-muted font-bold">{opt.label} — {Math.round((opt.pool/(getMarketTotal(selectedMarket)||1))*100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bets list */}
                  <div className="p-3.5 px-5 border-b border-border max-h-[110px] overflow-y-auto no-scrollbar">
                    <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Einsätze</div>
                    {bets.filter(b => b.marketId === selectedMarket.id).map(b => {
                      const p = players.find(pl => pl.id === b.playerId);
                      const optIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                      if (!p) return null;
                      return (
                        <div key={b.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                          <div className="w-[30px] h-[30px] rounded-lg bg-card flex items-center justify-center shrink-0 overflow-hidden">
                            {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
                          </div>
                          <span className="flex-1 text-[13px] font-extrabold text-white">{p.name}</span>
                          <span className={clsx('text-[11px] font-black rounded-lg px-2 py-0.5 border', OPT_BG[optIdx], OPT_TEXT[optIdx], OPT_BORDER[optIdx])}>{b.optionLabel}</span>
                          <span className="font-mono text-[12px] text-muted">{b.amount}</span>
                        </div>
                      );
                    })}
                    {bets.filter(b => b.marketId === selectedMarket.id).length === 0 && (
                      <div className="text-[12px] text-muted text-center py-2">Noch keine Einsätze</div>
                    )}
                  </div>

                  {/* Slider */}
                  {!selectedExpired && (
                    <div className="p-4 px-5 border-b border-border">
                      <div className="flex justify-between mb-2.5">
                        <span className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">Dein Einsatz</span>
                        <span className="font-mono text-[18px] font-bold text-yellow">{betAmount} TOKEN</span>
                      </div>
                      <input type="range" min="1" max={Math.min(500, me.tokens)} value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg" />
                    </div>
                  )}

                  {/* Expired notice */}
                  {selectedExpired && (
                    <div className="p-4 text-center">
                      <div className="text-red font-black text-[14px]">🔒 Hot Take abgelaufen</div>
                      <div className="text-muted text-[12px] mt-1">Keine Wetten mehr möglich</div>
                    </div>
                  )}

                  {/* Bet Buttons */}
                  {!selectedExpired && (
                    <div className={clsx('p-4 px-5 pb-7 grid gap-2 shrink-0', selectedMarket.options.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}>
                      {selectedMarket.options.map((opt, i) => {
                        const payout = calcPayout(selectedMarket, opt.id, betAmount, jackpot);
                        return (
                          <button key={opt.id} onClick={() => handleBet(opt.id, opt.label)} disabled={me.tokens < betAmount}
                            className={clsx('rounded-[18px] cursor-pointer font-sans border-2 transition-all hover:-translate-y-0.5 disabled:opacity-50 flex flex-col items-center justify-center py-3 px-2 gap-0.5',
                              i === 0 ? `border-transparent bg-gradient-to-br from-green to-[#00A86E] text-bg ${OPT_SHADOW[0]}` : `bg-transparent ${OPT_TEXT[i]} ${OPT_BORDER[i]} ${OPT_HOVER[i]}`)}>
                            <span className="text-[14px] font-black leading-none">{opt.label}</span>
                            <span className={clsx('text-[10px] font-bold', i === 0 ? 'text-bg/70' : 'opacity-60')}>~{payout} TKN</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG ────────────────────────────────────────────────────── */}
      {confirmBet && selectedMarket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-yellow/10 border border-yellow/20 flex items-center justify-center text-[28px] mb-4">⚠️</div>
            <div className="text-[20px] font-black text-white mb-2">Wette bestätigen</div>
            <div className="text-[14px] text-muted mb-6 leading-relaxed">
              <b className="text-white">{confirmBet.amount} TKN</b> auf <b className="text-yellow">„{confirmBet.optionLabel}"</b>?
              {selectedMarket.type === 'combo' && <><br /><span className="text-green font-black">Gewinn: {confirmBet.amount * (selectedMarket.multiplier ?? 3)} TKN</span></>}
              <br /><span className="text-[12px] text-red/80 font-bold uppercase tracking-wider mt-2 block">Kann nicht rückgängig gemacht werden!</span>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmBet(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={executeBet} className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_0_15px_rgba(255,212,71,0.4)] transition-all">Bestätigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}