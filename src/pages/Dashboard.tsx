import { useState } from 'react';
import { useStore, Market, getMarketTotal } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, Trophy, Lock } from 'lucide-react';

// ─── Option-Farben (Index 0–4) ────────────────────────────────────────────────
const OPT_HEX    = ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'];
const OPT_TEXT   = ['text-green','text-red','text-blue2','text-yellow','text-purple2'];
const OPT_BG     = ['bg-green/10','bg-red/10','bg-blue/10','bg-yellow/10','bg-purple/10'];
const OPT_BORDER = ['border-green/35','border-red/35','border-blue2/35','border-yellow/35','border-purple2/35'];
const OPT_HOVER  = ['hover:bg-green/15','hover:bg-red/15','hover:bg-blue/15','hover:bg-yellow/15','hover:bg-purple/15'];
const OPT_SHADOW = [
  'shadow-[0_8px_32px_rgba(0,214,143,0.35)]',
  'shadow-[0_8px_32px_rgba(255,61,90,0.35)]',
  'shadow-[0_8px_32px_rgba(59,110,255,0.35)]',
  'shadow-[0_8px_32px_rgba(255,212,71,0.35)]',
  'shadow-[0_8px_32px_rgba(139,61,255,0.35)]',
];

function calcPayout(market: Market, optionId: string, betAmt: number, jackpot: number): number {
  const opt = market.options.find(o => o.id === optionId);
  if (!opt) return 0;
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
          <div key={opt.id} className="h-full transition-all duration-500"
            style={{ width: `${(opt.pool / total) * 100}%`, backgroundColor: OPT_HEX[i] }} />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'my-bets' | 'leaderboard'>('dashboard');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [betAmount, setBetAmount] = useState(20);
  const [confirmBet, setConfirmBet] = useState<{ optionId: string; optionLabel: string; amount: number } | null>(null);
  const [openAnswerText, setOpenAnswerText] = useState('');  // NEW: for anonymous open questions
  const [answerSubmitted, setAnswerSubmitted] = useState(false); // NEW

  const navigate = useNavigate();
  const currentUser = useStore(s => s.currentUser);
  const players = useStore(s => s.players);
  const markets = useStore(s => s.markets);
  const bets = useStore(s => s.bets);
  const answers = useStore(s => s.answers);  // NEW
  const jackpot = useStore(s => s.jackpot);
  const placeBet = useStore(s => s.placeBet);
  const submitAnswer = useStore(s => s.submitAnswer);  // NEW
  const me = players.find(p => p.id === currentUser);

  const handleBet = (optionId: string, optionLabel: string) => {
    if (selectedMarket && me && me.tokens >= betAmount)
      setConfirmBet({ optionId, optionLabel, amount: betAmount });
  };

  const executeBet = () => {
    if (selectedMarket && me && confirmBet && me.tokens >= confirmBet.amount) {
      placeBet(selectedMarket.id, confirmBet.optionId, confirmBet.optionLabel, confirmBet.amount);
      setConfirmBet(null);
      setSelectedMarket(null);
    }
  };

  // NEW: submit open-text answer for anonymous open-question markets
  const handleSubmitOpenAnswer = () => {
    if (!selectedMarket || !openAnswerText.trim()) return;
    submitAnswer(selectedMarket.id, openAnswerText.trim());
    setAnswerSubmitted(true);
    setOpenAnswerText('');
    setTimeout(() => {
      setAnswerSubmitted(false);
      setSelectedMarket(null);
    }, 1500);
  };

  const openMarketModal = (m: Market) => {
    setSelectedMarket(m);
    setOpenAnswerText('');
    setAnswerSubmitted(false);
  };

  if (!me) return null;

  // ─── Ticker items — only live/dynamic data ────────────────────────────────
  const openMarketsCount = markets.filter(m => m.status === 'open').length;
  const hasActiveHotTake = markets.some(m => m.type === 'hot-take' && m.status === 'open');

  const tickerItems = [
    `🟢 LIVE — ${openMarketsCount} ${openMarketsCount === 1 ? 'Markt' : 'Märkte'} offen`,
    ...(hasActiveHotTake ? ['⚡ HOT TAKE läuft'] : []),
    `🎰 Jackpot: ${jackpot} TKN`,
  ];
  // Duplicate for seamless scroll
  const tickerContent = [...tickerItems, ...tickerItems];

  // ─── DASHBOARD TAB ───────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">
      {/* Hot Takes */}
      {markets.filter(m => m.type === 'hot-take' && m.status === 'open').map(m => {
        const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
        return (
          <div key={m.id} className="mb-2.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">⚡ Hot Take</span>
              <span className="text-[12px] font-bold text-blue2">LIVE</span>
            </div>
            <div onClick={() => openMarketModal(m)} className="bg-card border-[1.5px] border-blue2/50 rounded-[18px] p-4 relative overflow-hidden shadow-[0_0_30px_rgba(59,110,255,0.1),inset_0_0_40px_rgba(59,110,255,0.03)] cursor-pointer">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue via-purple to-cyan bg-[length:200%] animate-[hts_2s_linear_infinite]" />
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue/20 to-purple/20 border border-blue2/40 rounded-full px-3 py-1 text-[10px] font-black text-blue2 tracking-[0.1em] w-fit mb-2.5">⚡ HOT TAKE</div>
              <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
              <PoolBar market={m} />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted">Pool: <b className="text-white">{getMarketTotal(m)} TKN</b></span>
                {myBet ? (
                  <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
                ) : <span className="text-[11px] text-muted">Noch kein Einsatz</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Standard Markets */}
      <div className="flex items-center justify-between mb-2.5 mt-1">
        <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">Aktive Märkte</span>
        <span className="text-[12px] font-bold text-blue2">{markets.filter(m => m.type === 'standard' && m.status === 'open').length} offen</span>
      </div>
      {markets.filter(m => m.type === 'standard' && m.status === 'open').map(m => {
        const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
        return (
          <div key={m.id} onClick={() => openMarketModal(m)} className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer transition-all duration-200 relative overflow-hidden hover:border-blue/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue2/40 to-transparent" />
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_6px_rgba(0,214,143,1)] animate-[puls_1.5s_infinite]" />
              <span className="text-[10px] font-extrabold text-muted tracking-[0.1em]">Standard</span>
            </div>
            <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
            <PoolBar market={m} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">Pool: <b className="text-white">{getMarketTotal(m)} TKN</b></span>
              {myBet ? (
                <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
              ) : <span className="text-[11px] text-muted">Noch kein Einsatz</span>}
            </div>
          </div>
        );
      })}

      {/* Anonymous Markets */}
      {markets.filter(m => m.type === 'anonymous' && m.status === 'open').length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">[?] Anonym</span>
          </div>
          {markets.filter(m => m.type === 'anonymous' && m.status === 'open').map(m => {
            const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
            const myAnswer = answers.find(a => a.marketId === m.id && a.playerId === me.id);
            const hasParticipated = myBet || myAnswer;
            return (
              <div key={m.id} onClick={() => openMarketModal(m)} className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer">
                <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 mb-2.5 text-[10px] font-extrabold text-muted tracking-[0.1em]">
                  {m.isOpenQuestion ? '✏️ OFFENE FRAGE · Reveal nach Schluss' : '🕵️ ANONYM · Reveal nach Schluss'}
                </div>
                <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
                {!m.isOpenQuestion && <PoolBar market={m} />}
                <div className="flex items-center justify-between mt-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-extrabold font-mono">[?]</div>)}
                    <div className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-extrabold font-mono">
                      +{m.isOpenQuestion
                        ? answers.filter(a => a.marketId === m.id).length
                        : bets.filter(b => b.marketId === m.id).length}
                    </div>
                  </div>
                  {hasParticipated && (
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
    </div>
  );

  // ─── MY BETS TAB ─────────────────────────────────────────────────────────────
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
                <span className="text-[14px]">▶</span>
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
          if (isStorno)        { resultText = 'STORNO';    resultClass = 'text-muted';    resultAmt = `+${b.amount} TKN`; }
          else if (isRollover) { resultText = 'ROLLOVER';  resultClass = 'text-purple2';  resultAmt = `+${Math.floor(b.amount * 0.5)} TKN`; }
          else if (isWin) {
            resultText = 'WON ✓'; resultClass = 'text-green';
            const wOpt = m.options.find(o => o.id === b.optionId);
            const payout = wOpt ? Math.floor((b.amount / wOpt.pool) * getMarketTotal(m)) : 0;
            resultAmt = `+${payout} TKN`;
          } else               { resultText = 'LOST ✗';   resultClass = 'text-red';      resultAmt = `-${b.amount} TKN`; }

          return (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px]">▶</span>
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

  // ─── LEADERBOARD TAB ─────────────────────────────────────────────────────────
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
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[28px] z-40 animate-[crownBob_2s_ease-in-out_infinite] drop-shadow-[0_0_20px_rgba(255,212,71,0.9)]">👑</div>
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {top.avatar ? <img src={top.avatar} alt={top.name} className="w-[180px] h-[180px] object-contain" referrerPolicy="no-referrer" /> : <div className="w-[180px] h-[180px] rounded-full bg-white/5" />}
          </div>
          <div className="relative z-30 flex flex-col items-center mt-[120px] mb-3.5">
            <div className="flex items-center gap-2.5 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1 backdrop-blur-md">
              <div className="text-[20px] font-black text-white">{top.name}</div>
              <div className="bg-gradient-to-br from-yellow to-orange text-bg font-mono text-[11px] font-bold rounded-lg px-2.5 py-1">#1</div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-md">
              <span className="font-mono text-[18px] font-bold text-yellow">🪙 {top.tokens}</span>
              <span className="text-[12px] text-yellow/60 font-bold">TOKEN</span>
            </div>
          </div>
        </div>
        <div className="relative z-20 flex gap-2 px-4 pb-2.5 shrink-0">
          {sorted[1] && (
            <div className="flex-1 bg-card border border-[#C0C0DC]/30 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C8C8F0]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#C8C8F0] bg-[#C8C8F0]/10 border border-[#C8C8F0]/25">#2 🥈</div>
              <div className="w-9 h-9">{sorted[1].avatar ? <img src={sorted[1].avatar} alt={sorted[1].name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" /> : <div className="w-full h-full rounded-full bg-white/5" />}</div>
              <div className="text-[14px] font-black text-white text-center">{sorted[1].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sorted[1].tokens} TKN</div>
            </div>
          )}
          {sorted[2] && (
            <div className="flex-1 bg-card border border-[#CD7F32]/35 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CD7F32]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#CD7F32] bg-[#CD7F32]/10 border border-[#CD7F32]/25">#3 🥉</div>
              <div className="w-9 h-9">{sorted[2].avatar ? <img src={sorted[2].avatar} alt={sorted[2].name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" /> : <div className="w-full h-full rounded-full bg-white/5" />}</div>
              <div className="text-[14px] font-black text-white text-center">{sorted[2].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sorted[2].tokens} TKN</div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px] pt-1 relative z-10">
          {sorted.slice(3).map((p, i) => (
            <div key={p.id} className={clsx("flex items-center gap-3 bg-card border rounded-[14px] p-3 mb-1.5 cursor-pointer transition-all duration-150 relative", p.id === me.id ? "border-green/40 bg-green/5" : "border-border hover:border-blue/30 hover:translate-x-1", p.tokens === 0 && "border-red/25")}>
              {p.id === me.id && <div className="absolute left-0 top-1/5 bottom-1/5 w-[3px] rounded-r-sm bg-green shadow-[0_0_10px_rgba(0,214,143,1)]" />}
              <div className={clsx("font-mono text-[14px] font-bold w-6 text-center", p.id === me.id ? "text-yellow" : p.tokens === 0 ? "text-red" : "text-muted")}>#{i+4}</div>
              <div className="w-9 h-9 rounded-lg bg-input flex items-center justify-center border border-border shrink-0 overflow-hidden">
                {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full bg-white/5" />}
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-black text-white">{p.name} {p.id === me.id && <span className="text-[10px] text-green font-black">(Du)</span>}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {p.badges.length > 0 ? p.badges.map(b => (
                    <span key={b} className={clsx("text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-[0.05em]", b === 'MARKET MOVER' ? "text-green bg-green/10 border border-green/25" : b === 'BANKROTT' ? "text-red bg-red/10 border border-red/25" : "text-orange bg-orange/10 border border-orange/25")}>{b}</span>
                  )) : <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-[0.05em] text-muted border border-border">kein Badge</span>}
                </div>
              </div>
              <span className={clsx("font-mono text-[15px] font-bold", p.tokens === 0 ? "text-red" : "text-white")}>{p.tokens}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {activeTab === 'dashboard'
        ? <div className="absolute top-0 left-0 right-0 h-[290px] z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,110,255,.35)_0%,transparent_60%),radial-gradient(ellipse_at_100%_30%,rgba(139,61,255,.2)_0%,transparent_40%),radial-gradient(ellipse_at_0%_20%,rgba(0,229,255,.1)_0%,transparent_40%)]" />
        : <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,212,71,.18)_0%,transparent_40%),radial-gradient(ellipse_at_50%_32%,rgba(139,61,255,.25)_0%,transparent_45%),radial-gradient(ellipse_at_0%_60%,rgba(0,229,255,.07)_0%,transparent_40%)]" />
      }

      {/* Top Bar */}
      {activeTab === 'dashboard' && (
        <div className="relative z-30 px-5 pt-2.5 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-green rounded-full flex items-center justify-center text-[11px] shadow-[0_0_12px_rgba(0,214,143,0.5)]">🐼</div>
              <span className="text-[13px] font-black text-white tracking-[-0.3px]">Betpanda</span>
            </div>
            <div className="text-[11px] text-muted mt-[1px]">Hey, <b className="text-green">{me.name}</b></div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
              <span className="text-[14px]">🎰</span>
              <span className="font-mono text-[11px] font-bold text-yellow">{jackpot} TKN</span>
            </div>
            <button onClick={() => navigate('/admin')} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors">
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      {activeTab === 'dashboard' && (
        <div className="relative z-20 h-[290px] flex flex-col items-center shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(59,110,255,.25)_0%,transparent_65%)] animate-[flareMove_15s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] h-[80px] rounded-full bg-blue/30 blur-[35px] animate-[flareMove_10s_ease-in-out_infinite_reverse]" />
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {me.avatar ? <img src={me.avatar} alt={me.name} className="w-[200px] h-[200px] object-contain" referrerPolicy="no-referrer" /> : <div className="w-[200px] h-[200px] rounded-full bg-white/5" />}
          </div>
          <div className="relative z-30 flex flex-col items-center gap-3 mt-[220px]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Konto</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-white">{me.tokens + bets.filter(b => b.playerId === me.id && markets.find(m => m.id === b.marketId)?.status === 'open').reduce((s,b) => s+b.amount, 0)}</span>
                </div>
              </div>
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
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

      {/* ── TICKER — only live/dynamic items ────────────────────────────────── */}
      {activeTab === 'dashboard' && openMarketsCount > 0 && (
        <div className="bg-gradient-to-r from-blue via-purple to-blue bg-[length:200%_100%] animate-[gradMove_4s_linear_infinite] py-1.5 overflow-hidden shrink-0 relative z-30">
          <div className="flex gap-12 animate-[tick_20s_linear_infinite] w-max">
            {tickerContent.map((item, i) => (
              <span key={i} className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">{item}</span>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'my-bets' && renderMyBets()}
      {activeTab === 'leaderboard' && renderLeaderboard()}

      {/* Bottom Nav */}
      <div className="bg-[#050912]/95 backdrop-blur-xl border-t border-border px-2 pb-3 shrink-0 sticky bottom-0 z-40">
        <div className="grid grid-cols-3">
          {([['dashboard','Dashboard', LayoutDashboard],['my-bets','My Bets', Target],['leaderboard','Ranking', Trophy]] as const).map(([tab, label, Icon]) => (
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
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-[32px] flex flex-col relative overflow-hidden border-t border-border shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_-5%,rgba(0,214,143,.2)_0%,transparent_50%)]" />
            <div className="relative z-10 flex flex-col flex-1">
              <div className="w-10 h-1 rounded-full bg-white/10 mx-auto mt-3.5" />

              {/* Header */}
              <div className="p-4 px-5 border-b border-border flex justify-between items-start">
                <div>
                  <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">{selectedMarket.type} · Markt</div>
                  <div className="text-[20px] font-black text-white leading-[1.2]">{selectedMarket.question}</div>
                </div>
                <button onClick={() => setSelectedMarket(null)} className="text-muted hover:text-white p-2">✕</button>
              </div>

              {/* ── OPEN QUESTION MODE (anonymous only) ─────────────────── */}
              {selectedMarket.isOpenQuestion ? (
                <div className="p-4 px-5 pb-7">
                  {answerSubmitted ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="text-[48px]">✅</div>
                      <div className="text-[16px] font-black text-green">Antwort eingereicht!</div>
                      <div className="text-[12px] text-muted">Wird nach Schluss aufgedeckt</div>
                    </div>
                  ) : answers.find(a => a.marketId === selectedMarket.id && a.playerId === me.id) ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="text-[48px]">🕵️</div>
                      <div className="text-[16px] font-black text-muted">Bereits geantwortet</div>
                      <div className="text-[12px] text-muted">Deine Antwort wird nach Schluss aufgedeckt</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Deine anonyme Antwort</div>
                      <textarea
                        value={openAnswerText}
                        onChange={e => setOpenAnswerText(e.target.value)}
                        placeholder="Schreib deine Antwort hier... (anonym)"
                        rows={3}
                        className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-purple2 placeholder:text-muted placeholder:font-semibold resize-none mb-3"
                      />
                      <button
                        onClick={handleSubmitOpenAnswer}
                        disabled={!openAnswerText.trim()}
                        className="w-full p-3.5 rounded-xl bg-gradient-to-br from-purple to-purple2 font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(139,61,255,0.3)] transition-all duration-200 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        🕵️ Anonym einreichen
                      </button>
                    </>
                  )}
                </div>
              ) : (
                /* ── STANDARD BET MODE ────────────────────────────────── */
                <>
                  {/* Pool */}
                  <div className="p-4 px-5 border-b border-border">
                    <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Pool-Verteilung</div>
                    <div className="h-3 rounded-full overflow-hidden flex mb-2.5">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500"
                          style={{ width: `${(opt.pool / (getMarketTotal(selectedMarket) || 1)) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-between">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="flex flex-col gap-0.5">
                          <span className={clsx('font-mono text-[13px] font-bold', OPT_TEXT[i])}>{opt.pool} TKN</span>
                          <span className="text-[10px] text-muted font-bold">{opt.label} — {Math.round((opt.pool / (getMarketTotal(selectedMarket) || 1)) * 100)}%</span>
                        </div>
                      ))}
                      <div className="flex flex-col gap-0.5 text-right">
                        <span className="font-mono text-[13px] font-bold text-white">{getMarketTotal(selectedMarket)}</span>
                        <span className="text-[10px] text-muted font-bold">GESAMT</span>
                      </div>
                    </div>
                  </div>

                  {/* Bets list */}
                  <div className="p-3.5 px-5 border-b border-border max-h-[140px] overflow-y-auto no-scrollbar">
                    <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Wer wettet was</div>
                    {bets.filter(b => b.marketId === selectedMarket.id).map(b => {
                      const p = players.find(pl => pl.id === b.playerId);
                      const optIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                      if (!p) return null;
                      return (
                        <div key={b.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                          <div className="w-[34px] h-[34px] rounded-lg bg-card flex items-center justify-center shrink-0 overflow-hidden">
                            {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full bg-white/5" />}
                          </div>
                          <span className="flex-1 text-[13px] font-extrabold text-white">{p.name}</span>
                          <span className={clsx('text-[11px] font-black rounded-lg px-2 py-0.5 border', OPT_BG[optIdx], OPT_TEXT[optIdx], OPT_BORDER[optIdx])}>{b.optionLabel}</span>
                          <span className="font-mono text-[12px] text-muted min-w-[52px] text-right">{b.amount} TKN</span>
                        </div>
                      );
                    })}
                    {bets.filter(b => b.marketId === selectedMarket.id).length === 0 && (
                      <div className="text-[12px] text-muted text-center py-2">Noch keine Einsätze</div>
                    )}
                  </div>

                  {/* Slider */}
                  <div className="p-4 px-5 border-b border-border">
                    <div className="flex justify-between mb-2.5">
                      <span className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">Dein Einsatz</span>
                      <span className="font-mono text-[18px] font-bold text-yellow">{betAmount} TOKEN</span>
                    </div>
                    <input type="range" min="1" max={Math.min(500, me.tokens)} value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(59,110,255,0.5)]"
                    />
                  </div>

                  {/* Option Buttons */}
                  <div className={clsx('p-4 px-5 pb-7 grid gap-2 shrink-0', selectedMarket.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                    {selectedMarket.options.map((opt, i) => {
                      const payout = calcPayout(selectedMarket, opt.id, betAmount, jackpot);
                      return (
                        <button key={opt.id} onClick={() => handleBet(opt.id, opt.label)} disabled={me.tokens < betAmount}
                          className={clsx('rounded-[18px] cursor-pointer font-sans border-2 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 flex flex-col items-center justify-center py-3 px-2 gap-0.5',
                            i === 0 ? `border-transparent bg-gradient-to-br from-green to-[#00A86E] text-bg ${OPT_SHADOW[0]}` : `bg-transparent ${OPT_TEXT[i]} ${OPT_BORDER[i]} ${OPT_HOVER[i]}`
                          )}>
                          <span className="text-[15px] font-black leading-none">{opt.label}</span>
                          <span className={clsx('text-[10px] font-bold', i === 0 ? 'text-bg/70' : 'opacity-60')}>~{payout} TKN</span>
                        </button>
                      );
                    })}
                  </div>
                </>
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
            <div className="text-[20px] font-black text-white mb-2 leading-tight">Wette bestätigen</div>
            <div className="text-[14px] text-muted mb-6 leading-relaxed">
              Bist du sicher, dass du <b className="text-white">{confirmBet.amount} TKN</b> auf{' '}
              <b className="text-yellow">„{confirmBet.optionLabel}"</b> setzen möchtest?<br /><br />
              <span className="text-[12px] text-red/80 font-bold uppercase tracking-wider">Diese Aktion kann nicht rückgängig gemacht werden!</span>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmBet(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={executeBet} className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_0_15px_rgba(255,212,71,0.4)] hover:shadow-[0_0_25px_rgba(255,212,71,0.6)] transition-all">Bestätigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
