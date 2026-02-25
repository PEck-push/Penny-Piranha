import { useState, useEffect } from 'react';
import { useStore, Market } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'my-bets' | 'leaderboard'>('dashboard');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [betAmount, setBetAmount] = useState(20);
  const [confirmBet, setConfirmBet] = useState<{side: 'yes' | 'no', amount: number} | null>(null);

  const currentUser = useStore(state => state.currentUser);
  const players = useStore(state => state.players);
  const markets = useStore(state => state.markets);
  const bets = useStore(state => state.bets);
  const jackpot = useStore(state => state.jackpot);
  const placeBet = useStore(state => state.placeBet);
  
  const me = players.find(p => p.id === currentUser);
  
  const handleBet = (side: 'yes' | 'no') => {
    if (selectedMarket && me && me.tokens >= betAmount) {
      setConfirmBet({ side, amount: betAmount });
    }
  };

  const executeBet = () => {
    if (selectedMarket && me && confirmBet && me.tokens >= confirmBet.amount) {
      placeBet(selectedMarket.id, confirmBet.side, confirmBet.amount);
      setConfirmBet(null);
      setSelectedMarket(null);
    }
  };

  if (!me) return null;

  const renderDashboard = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">
      {/* Hot Take */}
      {markets.filter(m => m.type === 'hot-take' && m.status === 'open').map(m => (
        <div key={m.id} className="mb-2.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">⚡ Hot Take</span>
            <span className="text-[12px] font-bold text-blue2 cursor-pointer">LIVE</span>
          </div>
          <div 
            onClick={() => setSelectedMarket(m)}
            className="bg-card border-[1.5px] border-blue2/50 rounded-[18px] p-4 relative overflow-hidden shadow-[0_0_30px_rgba(59,110,255,0.1),inset_0_0_40px_rgba(59,110,255,0.03)] cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue via-purple to-cyan bg-[length:200%] animate-[hts_2s_linear_infinite]" />
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue/20 to-purple/20 border border-blue2/40 rounded-full px-3 py-1 text-[10px] font-black text-blue2 tracking-[0.1em]">
                ⚡ HOT TAKE
              </div>
            </div>
            <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
            <div className="mb-3">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono text-[12px] font-bold text-green">JA {Math.round((m.poolYes / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
                <span className="font-mono text-[12px] font-bold text-red">NEIN {Math.round((m.poolNo / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-red/20 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-green to-green2 shadow-[0_0_12px_rgba(0,214,143,0.4)]" style={{ width: `${(m.poolYes / (m.poolYes + m.poolNo || 1)) * 100}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">Pool: <b className="text-white">{m.poolYes + m.poolNo} TKN</b></span>
              {bets.find(b => b.marketId === m.id && b.playerId === me.id) ? (
                <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">
                  🪙 {bets.find(b => b.marketId === m.id && b.playerId === me.id)?.amount} auf {bets.find(b => b.marketId === m.id && b.playerId === me.id)?.side.toUpperCase()}
                </span>
              ) : (
                <span className="text-[11px] text-muted">Noch kein Einsatz</span>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Standard Markets */}
      <div className="flex items-center justify-between mb-2.5 mt-1">
        <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">Aktive Märkte</span>
        <span className="text-[12px] font-bold text-blue2 cursor-pointer">{markets.filter(m => m.type === 'standard' && m.status === 'open').length} offen</span>
      </div>
      {markets.filter(m => m.type === 'standard' && m.status === 'open').map(m => (
        <div 
          key={m.id}
          onClick={() => setSelectedMarket(m)}
          className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer transition-all duration-200 relative overflow-hidden hover:border-blue/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue2/40 to-transparent" />
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_6px_rgba(0,214,143,1)] animate-[puls_1.5s_infinite]" />
            <span className="text-[10px] font-extrabold text-muted tracking-[0.1em]">Standard</span>
          </div>
          <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
          <div className="mb-3">
            <div className="flex justify-between mb-1.5">
              <span className="font-mono text-[12px] font-bold text-green">JA {Math.round((m.poolYes / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
              <span className="font-mono text-[12px] font-bold text-red">NEIN {Math.round((m.poolNo / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-red/20 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-green to-green2 shadow-[0_0_12px_rgba(0,214,143,0.4)]" style={{ width: `${(m.poolYes / (m.poolYes + m.poolNo || 1)) * 100}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted">Pool: <b className="text-white">{m.poolYes + m.poolNo} TKN</b></span>
            {bets.find(b => b.marketId === m.id && b.playerId === me.id) ? (
              <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">
                🪙 {bets.find(b => b.marketId === m.id && b.playerId === me.id)?.amount} auf {bets.find(b => b.marketId === m.id && b.playerId === me.id)?.side.toUpperCase()}
              </span>
            ) : (
              <span className="text-[11px] text-muted">Noch kein Einsatz</span>
            )}
          </div>
        </div>
      ))}

      {/* Anonymous Markets */}
      {markets.filter(m => m.type === 'anonymous' && m.status === 'open').length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">[?] Anonym</span>
          </div>
          {markets.filter(m => m.type === 'anonymous' && m.status === 'open').map(m => (
            <div 
              key={m.id}
              onClick={() => setSelectedMarket(m)}
              className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer"
            >
              <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 mb-2.5 text-[10px] font-extrabold text-muted tracking-[0.1em]">
                🕵️ ANONYM · Reveal nach Schluss
              </div>
              <div className="text-[15px] font-black text-white leading-[1.3] mb-3.5">{m.question}</div>
              <div className="mb-3">
                <div className="flex justify-between mb-1.5">
                  <span className="font-mono text-[12px] font-bold text-green">JA {Math.round((m.poolYes / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
                  <span className="font-mono text-[12px] font-bold text-red">NEIN {Math.round((m.poolNo / (m.poolYes + m.poolNo || 1)) * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-red/20 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-green to-green2 shadow-[0_0_12px_rgba(0,214,143,0.4)]" style={{ width: `${(m.poolYes / (m.poolYes + m.poolNo || 1)) * 100}%` }} />
                </div>
              </div>
              <div className="flex gap-1 mt-2.5">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-extrabold font-mono">[?]</div>
                ))}
                <div className="w-8 h-8 rounded-lg bg-input border border-border flex items-center justify-center text-[12px] text-muted font-extrabold font-mono">+{bets.filter(b => b.marketId === m.id).length}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const renderLeaderboard = () => {
    const sortedPlayers = [...players].sort((a, b) => b.tokens - a.tokens);
    const topPlayer = sortedPlayers[0];
    
    return (
      <div className="flex-1 flex flex-col relative z-10">
        <div className="relative z-30 px-5 pt-3.5 flex items-center justify-between shrink-0">
          <div className="text-[22px] font-black text-white">Rangliste 🏆</div>
          <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
            <span className="text-[10px] font-extrabold text-yellow/50">JACKPOT</span>
            <span className="font-mono text-[12px] font-bold text-yellow">🎰 {jackpot}</span>
          </div>
        </div>

        {/* Hero #1 */}
        <div className="relative z-20 h-[250px] shrink-0 flex flex-col items-center justify-end overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,rgba(255,212,71,.22)_0%,transparent_65%)]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[260px] h-[70px] rounded-full bg-yellow/35 blur-[32px]" />
          
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[28px] z-40 animate-[crownBob_2s_ease-in-out_infinite] drop-shadow-[0_0_20px_rgba(255,212,71,0.9)]">👑</div>
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {topPlayer.avatar ? (
              <img src={topPlayer.avatar} alt={topPlayer.name} className="w-[180px] h-[180px] object-contain drop-shadow-[0_-12px_50px_rgba(255,212,71,0.8)] drop-shadow-[0_8px_30px_rgba(0,0,0,0.5)]" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-[180px] h-[180px] rounded-full bg-white/5" />
            )}
          </div>
          
          <div className="relative z-30 flex flex-col items-center mt-[120px] mb-3.5">
            <div className="flex items-center gap-2.5 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
              <div className="text-[20px] font-black text-white tracking-[-1px] drop-shadow-[0_0_30px_rgba(255,212,71,0.5)]">{topPlayer.name}</div>
              <div className="bg-gradient-to-br from-yellow to-orange text-bg font-mono text-[11px] font-bold rounded-lg px-2.5 py-1 tracking-[0.05em]">#1</div>
            </div>
            
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
              <span className="font-mono text-[18px] font-bold text-yellow drop-shadow-[0_0_20px_rgba(255,212,71,0.5)]">🪙 {topPlayer.tokens}</span>
              <span className="text-[12px] text-yellow/60 font-bold">TOKEN</span>
            </div>
          </div>
        </div>

        {/* #2 and #3 */}
        <div className="relative z-20 flex gap-2 px-4 pb-2.5 shrink-0">
          {sortedPlayers[1] && (
            <div className="flex-1 bg-card border border-[#C0C0DC]/30 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-[#C0C0DC]/60">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C8C8F0]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#C8C8F0] bg-[#C8C8F0]/10 border border-[#C8C8F0]/25">#2 🥈</div>
              <div className="w-9 h-9 drop-shadow-[0_0_14px_rgba(200,200,240,0.6)]">
                {sortedPlayers[1].avatar ? (
                  <img src={sortedPlayers[1].avatar} alt={sortedPlayers[1].name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full rounded-full bg-white/5" />
                )}
              </div>
              <div className="text-[14px] font-black text-white text-center">{sortedPlayers[1].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sortedPlayers[1].tokens} TKN</div>
            </div>
          )}
          {sortedPlayers[2] && (
            <div className="flex-1 bg-card border border-[#CD7F32]/35 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-[#CD7F32]/60">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CD7F32]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#CD7F32] bg-[#CD7F32]/10 border border-[#CD7F32]/25">#3 🥉</div>
              <div className="w-9 h-9 drop-shadow-[0_0_14px_rgba(205,127,50,0.6)]">
                {sortedPlayers[2].avatar ? (
                  <img src={sortedPlayers[2].avatar} alt={sortedPlayers[2].name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full rounded-full bg-white/5" />
                )}
              </div>
              <div className="text-[14px] font-black text-white text-center">{sortedPlayers[2].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{sortedPlayers[2].tokens} TKN</div>
            </div>
          )}
        </div>

        {/* Rest of list */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px] pt-1 relative z-10">
          {sortedPlayers.slice(3).map((p, i) => (
            <div 
              key={p.id}
              className={clsx(
                "flex items-center gap-3 bg-card border rounded-[14px] p-3 mb-1.5 cursor-pointer transition-all duration-150 relative",
                p.id === me.id ? "border-green/40 bg-green/5" : "border-border hover:border-blue/30 hover:translate-x-1",
                p.tokens === 0 && "border-red/25"
              )}
            >
              {p.id === me.id && <div className="absolute left-0 top-1/5 bottom-1/5 w-[3px] rounded-r-sm bg-green shadow-[0_0_10px_rgba(0,214,143,1)]" />}
              <div className={clsx("font-mono text-[14px] font-bold w-6 text-center", p.id === me.id ? "text-yellow" : p.tokens === 0 ? "text-red" : "text-muted")}>#{i + 4}</div>
              <div className="w-9 h-9 rounded-lg bg-input flex items-center justify-center border border-border shrink-0 overflow-hidden">
                {p.avatar ? (
                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-white/5" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-black text-white">
                  {p.name} {p.id === me.id && <span className="text-[10px] text-green font-black">(Du)</span>}
                </div>
                {p.badges.length > 0 ? (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.badges.map(b => (
                      <span key={b} className={clsx(
                        "text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-[0.05em]",
                        b === 'MARKET MOVER' ? "text-green bg-green/10 border border-green/25" :
                        b === 'BANKROTT' ? "text-red bg-red/10 border border-red/25" :
                        "text-orange bg-orange/10 border border-orange/25"
                      )}>{b}</span>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-[0.05em] text-muted border border-border">kein Badge</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className={clsx("font-mono text-[15px] font-bold block", p.tokens === 0 ? "text-red" : "text-white")}>{p.tokens}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMyBets = () => {
    const myBets = bets.filter(b => b.playerId === me.id);
    const activeBets = myBets.filter(b => {
      const m = markets.find(m => m.id === b.marketId);
      return m && (m.status === 'open' || m.status === 'locked');
    });
    const resolvedBets = myBets.filter(b => {
      const m = markets.find(m => m.id === b.marketId);
      return m && (m.status === 'resolved' || m.status === 'cancelled');
    });

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">
        <div className="text-[22px] font-black text-white mb-4">Meine Wetten 🎯</div>
        
        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5">Aktiv</div>
        {activeBets.length === 0 ? (
          <div className="text-[12px] text-muted mb-6">Keine aktiven Wetten</div>
        ) : (
          activeBets.map(b => {
            const m = markets.find(m => m.id === b.marketId);
            if (!m) return null;
            const potentialWin = Math.floor((b.amount / (b.side === 'yes' ? m.poolYes : m.poolNo)) * (m.poolYes + m.poolNo));
            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px]">▶</span>
                  <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                  <span className={clsx("text-[11px] font-black px-2 py-0.5 rounded-md", b.side === 'yes' ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
                    {b.side === 'yes' ? 'JA' : 'NEIN'}
                  </span>
                </div>
                <div className="text-[12px] text-muted flex justify-between">
                  <span>Einsatz: <b className="text-white">{b.amount} TKN</b></span>
                  <span>Möglicher Gewinn: <b className="text-yellow">~{potentialWin} TKN</b></span>
                </div>
              </div>
            );
          })
        )}

        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5 mt-6">Abgeschlossen</div>
        {resolvedBets.length === 0 ? (
          <div className="text-[12px] text-muted mb-6">Noch keine abgeschlossenen Wetten</div>
        ) : (
          resolvedBets.map(b => {
            const m = markets.find(m => m.id === b.marketId);
            if (!m) return null;
            const isWin = m.status === 'resolved' && m.winningOptionId === b.side;
            const isStorno = m.status === 'cancelled';
            const isRollover = m.status === 'resolved' && m.resolutionType === 'rollover';
            
            let resultText = '';
            let resultClass = '';
            let resultAmount = '';

            if (isStorno) {
              resultText = 'STORNO';
              resultClass = 'text-muted';
              resultAmount = `+${b.amount} TKN`;
            } else if (isRollover) {
              resultText = 'ROLLOVER';
              resultClass = 'text-purple2';
              resultAmount = `+${Math.floor(b.amount * 0.5)} TKN`;
            } else if (isWin) {
              resultText = 'WON ✓';
              resultClass = 'text-green';
              // Approximation since we don't store exact payout per bet
              const winPool = b.side === 'yes' ? m.poolYes : m.poolNo;
              const payout = Math.floor((b.amount / winPool) * (m.poolYes + m.poolNo));
              resultAmount = `+${payout} TKN`;
            } else {
              resultText = 'LOST ✗';
              resultClass = 'text-red';
              resultAmount = `-${b.amount} TKN`;
            }

            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5 opacity-70">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px]">▶</span>
                  <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                  <span className={clsx("text-[11px] font-black px-2 py-0.5 rounded-md", b.side === 'yes' ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
                    {b.side === 'yes' ? 'JA' : 'NEIN'}
                  </span>
                </div>
                <div className="text-[12px] text-muted flex justify-between">
                  <span>Einsatz: <b className="text-white">{b.amount} TKN</b></span>
                  <span className={clsx("font-bold", resultClass)}>{resultText} <span className="font-mono">{resultAmount}</span></span>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {/* Background */}
      {activeTab === 'dashboard' ? (
        <div className="absolute top-0 left-0 right-0 h-[290px] z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,110,255,.35)_0%,transparent_60%),radial-gradient(ellipse_at_100%_30%,rgba(139,61,255,.2)_0%,transparent_40%),radial-gradient(ellipse_at_0%_20%,rgba(0,229,255,.1)_0%,transparent_40%)]" />
      ) : (
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,212,71,.18)_0%,transparent_40%),radial-gradient(ellipse_at_50%_32%,rgba(139,61,255,.25)_0%,transparent_45%),radial-gradient(ellipse_at_0%_60%,rgba(0,229,255,.07)_0%,transparent_40%)]" />
      )}

      {/* Top Bar for Dashboard */}
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
          </div>
        </div>
      )}

      {/* Hero for Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="relative z-20 h-[290px] flex flex-col items-center shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(59,110,255,.25)_0%,transparent_65%)] animate-[flareMove_15s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] h-[80px] rounded-full bg-blue/30 blur-[35px] animate-[flareMove_10s_ease-in-out_infinite_reverse]" />
          
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]">
            {me.avatar ? (
              <img src={me.avatar} alt={me.name} className="w-[200px] h-[200px] object-contain drop-shadow-[0_-15px_50px_rgba(59,110,255,0.7)] drop-shadow-[0_8px_30px_rgba(0,0,0,0.4)]" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-[200px] h-[200px] rounded-full bg-white/5" />
            )}
          </div>
          
          <div className="relative z-30 flex flex-col items-center gap-3 mt-[220px]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Konto</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-white">{me.tokens + bets.filter(b => b.playerId === me.id).reduce((sum, b) => sum + b.amount, 0)}</span>
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

      {/* Ticker for Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="bg-gradient-to-r from-blue via-purple to-blue bg-[length:200%_100%] animate-[gradMove_4s_linear_infinite] py-1.5 overflow-hidden shrink-0 relative z-30">
          <div className="flex gap-12 animate-[tick_20s_linear_infinite] w-max">
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">🟢 LIVE — {markets.filter(m => m.status === 'open').length} Märkte offen</span>
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">⚡ HOT TAKE läuft</span>
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">Max ist MARKET MOVER 🐋</span>
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">🟢 LIVE — {markets.filter(m => m.status === 'open').length} Märkte offen</span>
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">⚡ HOT TAKE läuft</span>
            <span className="font-mono text-[10px] font-bold text-white/90 tracking-[0.08em] whitespace-nowrap">Max ist MARKET MOVER 🐋</span>
          </div>
        </div>
      )}

      {/* Content Area */}
      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'my-bets' && renderMyBets()}
      {activeTab === 'leaderboard' && renderLeaderboard()}

      {/* Bottom Nav */}
      <div className="bg-[#050912]/95 backdrop-blur-xl border-t border-border px-10 pb-3 shrink-0 sticky bottom-0 z-40">
        <div className="flex justify-around">
          <div 
            onClick={() => setActiveTab('dashboard')}
            className="flex-1 flex flex-col items-center px-2 pt-3 pb-1 gap-1 cursor-pointer relative"
          >
            <span className="text-[22px] leading-none">📊</span>
            <span className={clsx("text-[10px] font-black tracking-[0.08em] uppercase", activeTab === 'dashboard' ? "text-blue2" : "text-muted")}>Dashboard</span>
            {activeTab === 'dashboard' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-sm bg-gradient-to-r from-blue to-purple shadow-[0_0_10px_rgba(59,110,255,0.5)]" />
            )}
          </div>
          <div 
            onClick={() => setActiveTab('my-bets')}
            className="flex-1 flex flex-col items-center px-2 pt-3 pb-1 gap-1 cursor-pointer relative"
          >
            <span className="text-[22px] leading-none">🎯</span>
            <span className={clsx("text-[10px] font-black tracking-[0.08em] uppercase", activeTab === 'my-bets' ? "text-blue2" : "text-muted")}>My Bets</span>
            {activeTab === 'my-bets' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-sm bg-gradient-to-r from-blue to-purple shadow-[0_0_10px_rgba(59,110,255,0.5)]" />
            )}
          </div>
          <div 
            onClick={() => setActiveTab('leaderboard')}
            className="flex-1 flex flex-col items-center px-2 pt-3 pb-1 gap-1 cursor-pointer relative"
          >
            <span className="text-[22px] leading-none">🏆</span>
            <span className={clsx("text-[10px] font-black tracking-[0.08em] uppercase", activeTab === 'leaderboard' ? "text-blue2" : "text-muted")}>Ranking</span>
            {activeTab === 'leaderboard' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-sm bg-gradient-to-r from-blue to-purple shadow-[0_0_10px_rgba(59,110,255,0.5)]" />
            )}
          </div>
        </div>
      </div>

      {/* Bet Modal / Bottom Sheet */}
      {selectedMarket && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-bg rounded-t-[32px] flex flex-col relative overflow-hidden border-t border-border shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_-5%,rgba(0,214,143,.2)_0%,transparent_50%)]" />
            
            <div className="relative z-10 flex flex-col flex-1">
              <div className="w-10 h-1 rounded-full bg-white/10 mx-auto mt-3.5" />
              
              <div className="p-4 px-5 border-b border-border flex justify-between items-start">
                <div>
                  <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">
                    {selectedMarket.type} · Markt
                  </div>
                  <div className="text-[20px] font-black text-white leading-[1.2]">{selectedMarket.question}</div>
                </div>
                <button onClick={() => setSelectedMarket(null)} className="text-muted hover:text-white p-2">✕</button>
              </div>

              <div className="p-4 px-5 border-b border-border">
                <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Pool-Verteilung</div>
                <div className="h-3 rounded-full overflow-hidden bg-red/20 mb-2.5">
                  <div className="h-full bg-gradient-to-r from-green to-green2 rounded-full shadow-[0_0_15px_rgba(0,214,143,0.4)]" style={{ width: `${(selectedMarket.poolYes / (selectedMarket.poolYes + selectedMarket.poolNo || 1)) * 100}%` }} />
                </div>
                <div className="flex justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[15px] font-bold text-green">{selectedMarket.poolYes} TKN</span>
                    <span className="text-[10px] text-muted font-bold">JA — {Math.round((selectedMarket.poolYes / (selectedMarket.poolYes + selectedMarket.poolNo || 1)) * 100)}%</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-center">
                    <span className="font-mono text-[15px] font-bold text-white">{selectedMarket.poolYes + selectedMarket.poolNo}</span>
                    <span className="text-[10px] text-muted font-bold">GESAMT</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="font-mono text-[15px] font-bold text-red">{selectedMarket.poolNo} TKN</span>
                    <span className="text-[10px] text-muted font-bold">NEIN — {Math.round((selectedMarket.poolNo / (selectedMarket.poolYes + selectedMarket.poolNo || 1)) * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 px-5 border-b border-border max-h-[150px] overflow-y-auto no-scrollbar">
                <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Wer wettet was</div>
                {bets.filter(b => b.marketId === selectedMarket.id).map(b => {
                  const p = players.find(pl => pl.id === b.playerId);
                  if (!p) return null;
                  return (
                    <div key={b.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                      <div className="w-[34px] h-[34px] rounded-lg bg-card flex items-center justify-center shrink-0 overflow-hidden">
                        {p.avatar ? (
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full bg-white/5" />
                        )}
                      </div>
                      <span className="flex-1 text-[13px] font-extrabold text-white">{p.name}</span>
                      {b.side === 'yes' ? (
                        <span className="text-[11px] font-black text-green bg-green/10 border border-green/20 rounded-lg px-2 py-0.5">JA</span>
                      ) : (
                        <span className="text-[11px] font-black text-red bg-red/10 border border-red/20 rounded-lg px-2 py-0.5">NEIN</span>
                      )}
                      <span className="font-mono text-[12px] text-muted min-w-[52px] text-right">{b.amount} TKN</span>
                    </div>
                  );
                })}
                {bets.filter(b => b.marketId === selectedMarket.id).length === 0 && (
                  <div className="text-[12px] text-muted text-center py-2">Noch keine Einsätze</div>
                )}
              </div>

              <div className="p-4 px-5 border-b border-border">
                <div className="flex justify-between mb-2.5">
                  <span className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">Dein Einsatz</span>
                  <span className="font-mono text-[18px] font-bold text-yellow">{betAmount} TOKEN</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max={Math.min(500, me.tokens)} 
                  value={betAmount} 
                  onChange={(e) => setBetAmount(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-input rounded-full appearance-none outline-none mb-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(59,110,255,0.5)]"
                />
                <div className="bg-input border border-border rounded-[14px] p-3.5 px-4 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Potentieller Gewinn</div>
                    <div className="text-[11px] text-muted">bei JA — +{((betAmount / (selectedMarket.poolYes + betAmount)) * (selectedMarket.poolYes + selectedMarket.poolNo + betAmount) - betAmount).toFixed(1)} Gewinn</div>
                  </div>
                  <div className="font-mono text-[24px] font-bold text-yellow">
                    ~{((betAmount / (selectedMarket.poolYes + betAmount)) * (selectedMarket.poolYes + selectedMarket.poolNo + betAmount)).toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="p-4 px-5 pb-7 flex gap-2.5 shrink-0">
                <button 
                  onClick={() => handleBet('yes')}
                  disabled={me.tokens < betAmount}
                  className="flex-1 p-[18px] border-none rounded-[18px] cursor-pointer font-sans text-[16px] font-black text-bg bg-gradient-to-br from-green to-[#00A86E] shadow-[0_8px_32px_rgba(0,214,143,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_45px_rgba(0,214,143,0.5)] disabled:opacity-50"
                >
                  ↑ JA wetten
                </button>
                <button 
                  onClick={() => handleBet('no')}
                  disabled={me.tokens < betAmount}
                  className="flex-1 p-[18px] rounded-[18px] cursor-pointer font-sans text-[16px] font-black text-red bg-transparent border-2 border-red/45 transition-all duration-200 hover:bg-red/10 disabled:opacity-50"
                >
                  ↓ NEIN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Popup */}
      {confirmBet && selectedMarket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-yellow/10 border border-yellow/20 flex items-center justify-center text-[28px] mb-4 shadow-[0_0_20px_rgba(255,212,71,0.2)]">
              ⚠️
            </div>
            <div className="text-[20px] font-black text-white mb-2 leading-tight">Wette bestätigen</div>
            <div className="text-[14px] text-muted mb-6 leading-relaxed">
              Bist du sicher, dass du <b className="text-white">{confirmBet.amount} TKN</b> auf <b className={confirmBet.side === 'yes' ? 'text-green' : 'text-red'}>{confirmBet.side === 'yes' ? 'JA' : 'NEIN'}</b> setzen möchtest?<br/><br/>
              <span className="text-[12px] text-red/80 font-bold uppercase tracking-wider">Diese Aktion kann nicht rückgängig gemacht werden!</span>
            </div>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setConfirmBet(null)}
                className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Abbrechen
              </button>
              <button 
                onClick={executeBet}
                className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_0_15px_rgba(255,212,71,0.4)] hover:shadow-[0_0_25px_rgba(255,212,71,0.6)] transition-all"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
