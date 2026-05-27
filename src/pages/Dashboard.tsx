import { useState, useEffect } from 'react';
import { useStore, Market, getMarketTotal, buildSelectionKey } from '../store';
import { ACCESSORY_BY_ID } from '../data/accessories';
import CharacterAvatar from '../components/CharacterAvatar';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, Trophy, Lock, Calendar, HelpCircle, User } from 'lucide-react';
import { isAdminEmail } from '../config/admins';
import SpielplanTab from '../components/SpielplanTab';
import RevealScreen from '../components/RevealScreen';
import FeedWidget from '../components/FeedWidget';
import { JACKPOT_BLOCK_LABELS } from '../data/specialBets';

const OPT_HEX    = ['#E6B43C','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'];
const OPT_TEXT   = ['text-green','text-red','text-blue2','text-yellow','text-purple2'];
const OPT_BG     = ['bg-green/10','bg-red/10','bg-blue/10','bg-yellow/10','bg-purple/10'];
const OPT_BORDER = ['border-green/35','border-red/35','border-blue2/35','border-yellow/35','border-purple2/35'];
const OPT_HOVER  = ['hover:bg-green/15','hover:bg-red/15','hover:bg-blue/15','hover:bg-yellow/15','hover:bg-purple/15'];
const OPT_SHADOW = ['shadow-[0_8px_32px_rgba(230,180,60,0.35)]','shadow-[0_8px_32px_rgba(255,61,90,0.35)]','shadow-[0_8px_32px_rgba(59,110,255,0.35)]','shadow-[0_8px_32px_rgba(255,212,71,0.35)]','shadow-[0_8px_32px_rgba(139,61,255,0.35)]'];

function calcPayout(market: Market, optionId: string, betAmt: number): number {
  const opt = market.options.find(o => o.id === optionId);
  if (!opt) return 0;
  if (market.type === 'combo') return betAmt * (market.multiplier ?? 3);
  const simOpt = opt.pool + betAmt;
  const simTotal = getMarketTotal(market) + betAmt; // reiner Parimutuel-Pool, kein Jackpot
  if (simOpt === 0) return 0;
  return Math.max(Math.floor((betAmt / simOpt) * simTotal), betAmt + 2); // Mindestgewinn: Einsatz + 2
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

// ── Tipp-Verteilung (anonymes Gruppenbild: wie viele tippten worauf) ──────────────
function TipDistribution({ market, bets, accent }: { market: Market; bets: { marketId: string; optionId: string; optionLabel?: string }[]; accent: string }) {
  // Multiple-Choice: nach Kombination (optionLabel) gruppieren statt je Einzeloption.
  const rows = market.multiSelect
    ? (() => {
        const groups: Record<string, { label: string; count: number }> = {};
        bets.filter(b => b.marketId === market.id).forEach(b => {
          const k = b.optionId;
          if (!groups[k]) groups[k] = { label: b.optionLabel || k, count: 0 };
          groups[k].count++;
        });
        return Object.values(groups).map(g => ({ label: g.label, count: g.count }));
      })()
    : market.options.map(o => ({ label: o.label, count: bets.filter(b => b.marketId === market.id && b.optionId === o.id).length }));
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    return <div className="text-[10px] text-muted mb-2.5">Noch keine Tipps — sei der Erste!</div>;
  }
  return (
    <div className="flex flex-col gap-1 mb-2.5">
      <div className="text-[10px] font-bold text-muted mb-0.5">{total} {total === 1 ? 'Tipp' : 'Tipps'} bisher</div>
      {rows.map((r, i) => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-white/80 w-[42%] truncate shrink-0">{r.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: accent }} />
            </div>
            <span className="font-mono text-[10px] text-muted w-9 text-right shrink-0">{r.count} · {pct}%</span>
          </div>
        );
      })}
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'spielplan' | 'my-bets' | 'leaderboard'>('dashboard');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [betAmount, setBetAmount] = useState(20);
  const [confirmBet, setConfirmBet] = useState<{ optionId: string; optionLabel: string; amount: number } | null>(null);
  const [confirmTip, setConfirmTip] = useState<{ marketId: string; question: string; optionId: string; optionLabel: string } | null>(null);
  const [changingBetMarket, setChangingBetMarket] = useState<string | null>(null);
  const [changingTipMarket, setChangingTipMarket] = useState<string | null>(null);
  // Multiple-Choice: angekreuzte Optionen je Markt (vor dem Bestätigen)
  const [mcPick, setMcPick] = useState<Record<string, string[]>>({});
  const [openAnswerText, setOpenAnswerText] = useState('');
  const [answerSubmitted, setAnswerSubmitted] = useState(false);

  const navigate = useNavigate();
  const currentUser = useStore(s => s.currentUser);
  const players = useStore(s => s.players);
  const markets = useStore(s => s.markets);
  const bets = useStore(s => s.bets);
  const answers = useStore(s => s.answers);
  const jackpot = useStore(s => s.jackpot);
  const adminMessage = useStore(s => s.adminMessage);
  const placeBet  = useStore(s => s.placeBet);
  const placeTip  = useStore(s => s.placeTip);
  const changeBet = useStore(s => s.changeBet);
  const changeTip = useStore(s => s.changeTip);
  const logoutAuth = useStore(s => s.logoutAuth);
  const submitAnswer = useStore(s => s.submitAnswer);
  const me = players.find(p => p.id === currentUser);
  const isAdmin = me?.isAdmin || isAdminEmail(me?.email);
  const [revealDone, setRevealDone] = useState(false);

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

  if (!me) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg px-8 gap-5 text-center">
        <img src="/logo-icon.webp" alt="" className="w-20 h-20 object-contain" />
        <div className="text-[18px] font-black text-white">Kein Spielerprofil gefunden</div>
        <div className="text-[13px] text-muted leading-relaxed">
          Dein Account wurde möglicherweise zurückgesetzt.<br />Bitte neu registrieren.
        </div>
        <button
          onClick={() => { logoutAuth(); navigate('/register'); }}
          className="w-full max-w-[260px] p-3.5 rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-black text-[15px] text-bg shadow-[0_6px_24px_rgba(230,180,60,0.4)]"
        >
          Jetzt registrieren
        </button>
        <button
          onClick={() => logoutAuth()}
          className="text-[12px] text-muted underline underline-offset-2"
        >
          Abmelden
        </button>
      </div>
    );
  }

  // Show result-reveal sequence if there are unseen resolutions
  const unseenIds = me.unseenResolutions ?? [];
  const shouldReveal = !revealDone && unseenIds.length > 0;
  if (shouldReveal) {
    return <RevealScreen marketIds={unseenIds} onDone={() => setRevealDone(true)} />;
  }

  const openMarketsCount = markets.filter(m => m.status === 'open').length;
  const hasActiveHotTake = markets.some(m => m.type === 'hot-take' && m.status === 'open' && !(m.expiresAt && now > m.expiresAt));

  // Gesamter verfügbarer Jackpot = angesparter Pot + Summe aller festen Preise offener Jackpot-Runden
  const totalJackpot = jackpot + markets
    .filter(m => m.status === 'open' && m.marketSubtype === 'jackpot')
    .reduce((sum, m) => sum + (m.fixedPrize ?? 0), 0);
  const tickerItems = [
    ...(adminMessage ? [`📢 ${adminMessage}`] : []),
    `🟢 LIVE — ${openMarketsCount} Märkte offen`,
    ...(hasActiveHotTake ? ['⚡ HOT TAKE läuft'] : []),
    `🎰 Jackpot: ${totalJackpot} TKN`,
  ];
  const tickerContent = [...tickerItems, ...tickerItems];

  // Special-bet card (international or Austria block)
  const renderSpecialCard = (m: Market, austria: boolean) => {
    const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
    const total = getMarketTotal(m);
    return (
      <div key={m.id} onClick={() => openMarketModal(m)}
        className={clsx(
          'bg-card border rounded-[18px] p-4 mb-2.5 cursor-pointer transition-all hover:-translate-y-0.5 relative overflow-hidden',
          austria ? 'border-[#EF3340]/35 hover:border-[#EF3340]/60' : 'border-purple2/30 hover:border-purple2/60',
        )}>
        <div className={clsx('absolute top-0 left-0 right-0 h-[2px]', austria ? 'bg-gradient-to-r from-transparent via-[#EF3340]/70 to-transparent' : 'bg-gradient-to-r from-transparent via-purple2/60 to-transparent')} />
        <div className="flex items-center gap-1.5 mb-2">
          <span className={clsx('text-[10px] font-black tracking-[0.1em] px-2 py-0.5 rounded-md border',
            austria ? 'text-[#EF3340] bg-[#EF3340]/10 border-[#EF3340]/25' : 'text-purple2 bg-purple/10 border-purple2/25')}>
            {austria ? '🇦🇹 ÖSTERREICH' : '🌟 SPEZIAL'}
          </span>
        </div>
        <div className="text-[15px] font-black text-white leading-[1.3] mb-3">{m.question}</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {m.options.map(opt => (
            <span key={opt.id} className="text-[10px] font-bold text-muted bg-white/5 border border-white/10 rounded-md px-2 py-0.5">
              {opt.label}{opt.pool > 0 ? ` · ${opt.pool}` : ''}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Pool: <b className="text-white">{total} TKN</b></span>
          {myBet
            ? <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">🪙 {myBet.amount} auf {myBet.optionLabel}</span>
            : <span className="text-[11px] text-muted">Tippen →</span>}
        </div>
      </div>
    );
  };

  // ─── DASHBOARD TAB ─────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">

      {/* Hinweis: Account noch nicht freigegeben (Zahlung ausständig) */}
      {me.approved === false && (
        <div className="bg-yellow/10 border border-yellow/30 rounded-2xl px-4 py-3 mb-3 flex items-start gap-2.5">
          <span className="text-[18px] leading-none">⏳</span>
          <div className="text-[12px] text-yellow/90 leading-relaxed">
            <b className="text-yellow">Zahlung ausständig.</b> Dein Account ist noch nicht freigegeben —
            sobald deine Einzahlung beim Admin eingegangen ist, wirst du freigeschaltet und zählst voll mit.
          </div>
        </div>
      )}

      {/* Hot Takes */}
      {markets.filter(m => m.type === 'hot-take' && m.status === 'open').map(m => (
        <HotTakeCard key={m.id} m={m} onClick={() => openMarketModal(m)} myBet={bets.find(b => b.marketId === m.id && b.playerId === me.id)} />
      ))}

      {/* Old-style combos (backwards compat) */}
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

      {/* New combo groups — each leg is individually bettable */}
      {(() => {
        const groupIds = [...new Set(
          markets.filter(m => m.comboGroupId && m.status === 'open').map(m => m.comboGroupId!)
        )];
        if (groupIds.length === 0) return null;
        return (
          <>
            <div className="flex items-center justify-between mb-2.5 mt-1">
              <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">🔗 Combo-Wetten</span>
              <span className="text-[12px] font-bold text-purple2">{groupIds.length} aktiv</span>
            </div>
            {groupIds.map(groupId => {
              const groupMarkets = markets.filter(m => m.comboGroupId === groupId && m.status === 'open');
              const groupLabel = groupMarkets[0]?.comboGroupLabel ?? 'Combo';
              return (
                <div key={groupId} className="mb-3 bg-card border border-purple2/30 rounded-[20px] overflow-hidden relative">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple via-purple2 to-blue" />
                  <div className="p-3.5 px-4 border-b border-purple2/20">
                    <span className="text-[10px] font-black text-purple2 bg-purple/15 border border-purple2/30 rounded-full px-2.5 py-1 tracking-[0.1em]">🔗 COMBO</span>
                    <div className="text-[14px] font-black text-white mt-1.5">{groupLabel}</div>
                  </div>
                  {groupMarkets.map((m, i) => {
                    const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
                    return (
                      <div key={m.id} onClick={() => openMarketModal(m)}
                        className={clsx('p-3.5 px-4 cursor-pointer hover:bg-white/5 transition-all',
                          i < groupMarkets.length - 1 && 'border-b border-purple2/15')}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-black text-muted w-4 text-center shrink-0">{i + 1}</span>
                          <span className="text-[13px] font-black text-white flex-1 leading-tight">{m.question}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-6">
                          {m.options.map(opt => (
                            <span key={opt.id} className="text-[10px] font-bold text-muted bg-white/5 border border-white/10 rounded-md px-2 py-0.5">
                              {opt.label}{opt.pool > 0 ? ` · ${opt.pool}` : ''}
                            </span>
                          ))}
                        </div>
                        {myBet && (
                          <div className="mt-1.5 ml-6">
                            <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-1">
                              🪙 {myBet.amount} auf {myBet.optionLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        );
      })()}

      {/* Spezialwetten (international) */}
      {markets.filter(m => m.marketSubtype === 'spezialwette' && !m.austriaBlock && m.status === 'open').length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[12px] font-black text-purple2 uppercase tracking-[0.1em]">🌟 Spezialwetten</span>
          </div>
          {markets.filter(m => m.marketSubtype === 'spezialwette' && !m.austriaBlock && m.status === 'open').map(m =>
            renderSpecialCard(m, false),
          )}
        </>
      )}

      {/* Jackpot-Sonderrunden (einsatzfrei, fester Haus-Preis) — inkl. 🇦🇹 Österreich-Block */}
      {(() => {
        const jpMarkets = markets.filter(m => m.marketSubtype === 'jackpot' && m.status === 'open');
        if (jpMarkets.length === 0) return null;
        const blockOrder = ['block1', 'austria', 'block2', 'finale'];
        const blocks = [...new Set(jpMarkets.map(m => m.jackpotBlock ?? 'finale'))]
          .sort((a, b) => blockOrder.indexOf(a) - blockOrder.indexOf(b));
        return (
          <>
            <div className="flex items-center justify-between mb-2.5 mt-1">
              <span className="text-[12px] font-black text-yellow uppercase tracking-[0.1em]">🎰 Jackpot-Sonderrunden</span>
              <span className="text-[12px] font-bold text-yellow">gratis tippen</span>
            </div>
            {blocks.map(block => {
              const blockMarkets = jpMarkets.filter(m => (m.jackpotBlock ?? 'finale') === block);
              const label = blockMarkets[0]?.jackpotBlockLabel ?? JACKPOT_BLOCK_LABELS[block] ?? 'Jackpot';
              const aut = block === 'austria';
              return (
                <div key={block} className={clsx('mb-3 bg-card border rounded-[20px] overflow-hidden relative',
                  aut ? 'border-[#EF3340]/40' : 'border-yellow/30')}>
                  <div className={clsx('absolute top-0 left-0 right-0 h-[2px]',
                    aut ? 'bg-gradient-to-r from-[#EF3340] via-white to-[#EF3340]' : 'bg-gradient-to-r from-yellow via-orange to-yellow')} />
                  <div className={clsx('p-3.5 px-4 border-b', aut ? 'border-[#EF3340]/20' : 'border-yellow/20')}>
                    <span className={clsx('text-[10px] font-black rounded-full px-2.5 py-1 tracking-[0.1em]',
                      aut ? 'text-[#EF3340] bg-[#EF3340]/10 border border-[#EF3340]/30' : 'text-yellow bg-yellow/10 border border-yellow/30')}>{label}</span>
                  </div>
                  {blockMarkets.map((m, idx) => {
                    const myTip = bets.find(b => b.marketId === m.id && b.playerId === me.id);
                    const totalPrize = (m.fixedPrize ?? 0) + (m.absorbsJackpotPot ? jackpot : 0);
                    const tippers = bets.filter(b => b.marketId === m.id).length;
                    const isChangingTip = changingTipMarket === m.id;
                    return (
                      <div key={m.id} className={clsx('p-3.5 px-4', idx < blockMarkets.length - 1 && (aut ? 'border-b border-[#EF3340]/15' : 'border-b border-yellow/15'))}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[13px] font-black text-white flex-1 leading-tight">{m.question}</span>
                        </div>
                        {/* Preis-Info */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className={clsx('text-[11px] font-black rounded-md px-2 py-0.5',
                            aut ? 'text-[#EF3340] bg-[#EF3340]/10 border border-[#EF3340]/25' : 'text-yellow bg-yellow/10 border border-yellow/25')}>
                            🏆 {totalPrize} TKN
                          </span>
                          {tippers > 0 && (
                            <span className="text-[10px] text-muted">
                              ≈ {Math.floor(totalPrize / tippers)} TKN pro Tipper ({tippers})
                            </span>
                          )}
                        </div>
                        <TipDistribution market={m} bets={bets} accent={aut ? '#EF3340' : '#E6B43C'} />
                        {myTip && !isChangingTip ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[11px] font-black text-green bg-green/10 border border-green/20 rounded-lg px-2 py-1.5">
                              ✓ Dein Tipp: {myTip.optionLabel}
                            </div>
                            {m.status === 'open' && (
                              <button onClick={() => setChangingTipMarket(m.id)}
                                className={clsx('text-[10px] font-black rounded-lg px-2 py-1.5 border transition-colors cursor-pointer',
                                  aut ? 'text-[#EF3340] border-[#EF3340]/30 bg-[#EF3340]/5 hover:bg-[#EF3340]/15' : 'text-yellow border-yellow/30 bg-yellow/5 hover:bg-yellow/15')}>
                                ✏️ Ändern
                              </button>
                            )}
                          </div>
                        ) : m.multiSelect ? (
                          (() => {
                            const pick = mcPick[m.id] ?? [];
                            const toggle = (id: string) => setMcPick(s => {
                              const cur = s[m.id] ?? [];
                              return { ...s, [m.id]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
                            });
                            const labels = m.options.filter(o => pick.includes(o.id)).map(o => o.label).join(' + ');
                            return (
                              <div className="flex flex-col gap-1.5">
                                <div className="text-[10px] font-black text-blue2">☑️ {isChangingTip ? 'Neue Auswahl' : 'Mehrere ankreuzbar'} — exakt richtig gewinnt:</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {m.options.map(opt => {
                                    const on = pick.includes(opt.id);
                                    return (
                                      <button key={opt.id} onClick={() => toggle(opt.id)}
                                        className={clsx('text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition-all cursor-pointer',
                                          on ? (aut ? 'text-[#EF3340] border-[#EF3340]/50 bg-[#EF3340]/15' : 'text-yellow border-yellow/50 bg-yellow/15')
                                             : 'text-white bg-white/5 border-white/15 hover:border-white/30')}>
                                        {on ? '☑ ' : '☐ '}{opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    disabled={pick.length === 0}
                                    onClick={() => {
                                      const key = buildSelectionKey(pick);
                                      if (isChangingTip) { changeTip(m.id, key, labels); setChangingTipMarket(null); }
                                      else setConfirmTip({ marketId: m.id, question: m.question, optionId: key, optionLabel: labels });
                                      setMcPick(s => ({ ...s, [m.id]: [] }));
                                    }}
                                    className={clsx('text-[11px] font-black rounded-lg px-3 py-1.5 border transition-all cursor-pointer disabled:opacity-40',
                                      aut ? 'text-[#EF3340] border-[#EF3340]/40 bg-[#EF3340]/10' : 'text-yellow border-yellow/40 bg-yellow/10')}>
                                    {isChangingTip ? 'Übernehmen' : 'Tipp abgeben'} ({pick.length})
                                  </button>
                                  {isChangingTip && (
                                    <button onClick={() => { setChangingTipMarket(null); setMcPick(s => ({ ...s, [m.id]: [] })); }}
                                      className="text-[11px] text-muted border border-white/10 rounded-lg px-2.5 py-1.5 hover:text-white cursor-pointer">
                                      Abbrechen
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {isChangingTip && (
                              <div className="w-full text-[10px] font-black text-yellow mb-1">✏️ Neuen Tipp wählen:</div>
                            )}
                            {m.options.map(opt => (
                              <button key={opt.id}
                                onClick={() => {
                                  if (isChangingTip) { changeTip(m.id, opt.id, opt.label); setChangingTipMarket(null); }
                                  else setConfirmTip({ marketId: m.id, question: m.question, optionId: opt.id, optionLabel: opt.label });
                                }}
                                className={clsx('text-[11px] font-bold text-white bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer',
                                  aut ? 'hover:border-[#EF3340]/50 hover:bg-[#EF3340]/10' : 'hover:border-yellow/50 hover:bg-yellow/10')}>
                                {opt.label}
                              </button>
                            ))}
                            {isChangingTip && (
                              <button onClick={() => setChangingTipMarket(null)}
                                className="text-[11px] text-muted border border-white/10 rounded-lg px-2.5 py-1.5 hover:text-white cursor-pointer">
                                Abbrechen
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        );
      })()}

      {/* Standard (eigene Custom-Märkte; WM-Matches laufen im Spielplan) */}
      {markets.filter(m => m.type === 'standard' && m.status === 'open' && !m.marketSubtype && !m.comboGroupId).length > 0 && (
        <div className="flex items-center justify-between mb-2.5 mt-1">
          <span className="text-[12px] font-black text-muted uppercase tracking-[0.1em]">Aktive Märkte</span>
          <span className="text-[12px] font-bold text-blue2">{markets.filter(m => m.type === 'standard' && m.status === 'open' && !m.marketSubtype && !m.comboGroupId).length} offen</span>
        </div>
      )}
      {markets.filter(m => m.type === 'standard' && m.status === 'open' && !m.marketSubtype && !m.comboGroupId).map(m => {
        const myBet = bets.find(b => b.marketId === m.id && b.playerId === me.id);
        return (
          <div key={m.id} onClick={() => openMarketModal(m)} className="bg-card border border-border rounded-[18px] p-4 mb-2.5 cursor-pointer transition-all hover:border-blue/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue2/40 to-transparent" />
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_6px_rgba(230,180,60,1)] animate-[puls_1.5s_infinite]" />
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
        <div className="flex flex-col items-center gap-3 mt-8 mb-6 text-center px-6">
          <div className="text-[48px]">🎲</div>
          <div className="text-[16px] font-black text-muted">Noch keine Märkte offen</div>
          <div className="text-[12px] text-muted/60">Der Admin kann neue Märkte erstellen</div>
        </div>
      )}

      {/* Activity Feed Widget */}
      <FeedWidget maxItems={5} className="mb-3" />
    </div>
  );

  // ─── MY BETS TAB ───────────────────────────────────────────────────────────
  const renderMyBets = () => {
    const myBets = bets.filter(b => b.playerId === me.id);
    const active = myBets.filter(b => { const m = markets.find(m => m.id === b.marketId); return m && (m.status === 'open' || m.status === 'locked'); });
    const resolved = myBets.filter(b => { const m = markets.find(m => m.id === b.marketId); return m && (m.status === 'resolved' || m.status === 'cancelled'); });
    const myBetMarketIds = new Set(myBets.map(b => b.marketId));
    const untipped = markets.filter(m => m.status === 'open' && !myBetMarketIds.has(m.id));
    const goToMarket = (m: Market) => {
      openMarketModal(m);
    };
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] pt-3.5 px-4 relative z-10">
        <div className="text-[22px] font-black text-white mb-4">Meine Wetten 🎯</div>

        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[12px] font-black text-blue2 uppercase tracking-[0.1em]">🔔 Offen — noch nicht getippt</span>
          {untipped.length > 0 && <span className="text-[12px] font-bold text-blue2">{untipped.length}</span>}
        </div>
        {untipped.length === 0 ? <div className="text-[12px] text-muted mb-6">Alles getippt — stark! 🎯</div> : (
          <div className="mb-6">
            {untipped.map(m => {
              const isJackpot = m.marketSubtype === 'jackpot';
              const isWm = !!m.matchId;
              const icon = isJackpot ? '🎰' : isWm ? '⚽' : m.type === 'combo' ? '🔗' : m.marketSubtype === 'spezialwette' ? '🌟' : '▶';
              return (
                <div key={m.id} onClick={() => goToMarket(m)}
                  className="bg-card border border-blue2/30 rounded-2xl p-3.5 mb-2 cursor-pointer transition-all hover:border-blue2/60 hover:-translate-y-0.5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue2/50 to-transparent" />
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] shrink-0">{icon}</span>
                    <span className="text-[13px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                    <span className="text-[10px] font-black text-blue2 bg-blue/10 border border-blue2/25 rounded-md px-2 py-0.5 shrink-0">
                      {isJackpot ? 'gratis' : 'tippen →'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5">Aktiv</div>
        {active.length === 0 ? <div className="text-[12px] text-muted mb-6">Keine aktiven Wetten</div> : active.map(b => {
          const m = markets.find(m => m.id === b.marketId);
          if (!m) return null;
          const opt = m.options.find(o => o.id === b.optionId);
          const optIdx = m.options.findIndex(o => o.id === b.optionId);
          const isJackpot = m.marketSubtype === 'jackpot';
          const potWin = calcPayout(m, b.optionId, b.amount);
          return (
            <div key={b.id} onClick={() => goToMarket(m)} className="bg-card border border-border rounded-2xl p-4 mb-2.5 cursor-pointer transition-all hover:border-blue/40 hover:-translate-y-0.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px]">{isJackpot ? '🎰' : m.type === 'combo' ? '🔗' : '▶'}</span>
                <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                <span className={clsx('text-[11px] font-black px-2 py-0.5 rounded-md', OPT_BG[optIdx], OPT_TEXT[optIdx])}>{opt?.label}</span>
              </div>
              <div className="text-[12px] text-muted flex justify-between">
                {isJackpot ? (
                  <>
                    <span className="text-green font-bold">Gratis-Tipp</span>
                    <span>Preistopf: <b className="text-yellow">{m.absorbsJackpotPot ? `${m.fixedPrize ?? 0} + Jackpot` : `${m.fixedPrize ?? 0}`} TKN</b></span>
                  </>
                ) : (
                  <>
                    <span>Einsatz: <b className="text-white">{b.amount} TKN</b></span>
                    <span>Möglicher Gewinn: <b className="text-yellow">~{potWin} TKN</b></span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="text-[12px] font-black text-muted uppercase tracking-[0.1em] mb-2.5 mt-6">Abgeschlossen</div>
        {resolved.length === 0 ? <div className="text-[12px] text-muted mb-6">Noch keine abgeschlossenen Wetten</div> : resolved.map(b => {
          const m = markets.find(m => m.id === b.marketId);
          if (!m) return null;
          const optIdx = m.options.findIndex(o => o.id === b.optionId);
          const isJackpot = m.marketSubtype === 'jackpot';
          const isWin = m.status === 'resolved' && m.winningOptionId === b.optionId;
          const isStorno = m.status === 'cancelled';
          const isRollover = m.status === 'resolved' && m.resolutionType === 'rollover';
          let resultText = '', resultClass = '', resultAmt = '';
          if (isStorno) { resultText = 'STORNO'; resultClass = 'text-muted'; resultAmt = isJackpot ? '' : `+${b.amount} TKN`; }
          else if (isRollover) { resultText = 'ROLLOVER'; resultClass = 'text-purple2'; resultAmt = `+${Math.floor(b.amount * 0.5)} TKN`; }
          else if (isWin) {
            resultText = isJackpot ? '🎰 GEWONNEN' : 'WON ✓'; resultClass = 'text-green';
            if (isJackpot) { resultAmt = 'Preis erhalten'; }
            else if (m.type === 'combo') { resultAmt = `+${b.amount * (m.multiplier ?? 3)} TKN`; }
            else { const wOpt = m.options.find(o => o.id === b.optionId); resultAmt = `+${wOpt && wOpt.pool > 0 ? Math.floor((b.amount / wOpt.pool) * getMarketTotal(m)) : 0} TKN`; }
          } else { resultText = isJackpot ? 'Daneben' : 'LOST ✗'; resultClass = 'text-red'; resultAmt = isJackpot ? '' : `-${b.amount} TKN`; }
          return (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-2.5 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px]">{isJackpot ? '🎰' : m.type === 'combo' ? '🔗' : '▶'}</span>
                <span className="text-[14px] font-bold text-white flex-1 leading-tight">{m.question}</span>
                <span className={clsx('text-[11px] font-black px-2 py-0.5 rounded-md', OPT_BG[optIdx] ?? OPT_BG[0], OPT_TEXT[optIdx] ?? OPT_TEXT[0])}>{b.optionLabel}</span>
              </div>
              <div className="text-[12px] text-muted flex justify-between">
                <span>{isJackpot ? <span className="text-green font-bold">Gratis-Tipp</span> : <>Einsatz: <b className="text-white">{b.amount} TKN</b></>}</span>
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
    // Kleine Achievement-Icons (aktive Accessoires) für die Rangliste.
    const accIcons = (p: typeof players[0]) => {
      const ids = [p.activeAccessories?.head, p.activeAccessories?.hand, p.activeAccessories?.torso]
        .filter(Boolean) as string[];
      const items = ids.map(id => ACCESSORY_BY_ID[id]).filter(Boolean);
      if (items.length === 0) return null;
      return (
        <span className="flex items-center gap-0.5 shrink-0">
          {items.map((a, i) => <span key={i} title={a.label} className="text-[12px] leading-none">{a.icon}</span>)}
        </span>
      );
    };
    const playerTotal = (p: typeof players[0]) =>
      p.tokens + bets.filter(b => b.playerId === p.id && markets.find(m => m.id === b.marketId)?.status === 'open').reduce((s, b) => s + b.amount, 0);
    // Pending-Spieler bleiben in der Liste, werden aber gedimmt dargestellt.
    const sorted = [...players].sort((a, b) => playerTotal(b) - playerTotal(a));
    const dim = (p?: typeof players[0]) => (p?.approved === false ? 'opacity-[0.6]' : '');
    const top = sorted[0];
    return (
      <div className="flex-1 flex flex-col relative z-10">
        <div className="relative z-30 px-5 pt-3.5 flex items-center justify-between shrink-0">
          <div className="text-[22px] font-black text-white">Rangliste 🏆</div>
          <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
            <span className="text-[10px] font-extrabold text-yellow/50">JACKPOT</span>
            <span className="font-mono text-[12px] font-bold text-yellow">🎰 {totalJackpot}</span>
          </div>
        </div>
        <div className="relative z-20 h-[250px] shrink-0 flex flex-col items-center justify-end overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,rgba(255,212,71,.22)_0%,transparent_65%)]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[260px] h-[70px] rounded-full bg-yellow/35 blur-[32px]" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[28px] z-40 animate-[crownBob_2s_ease-in-out_infinite]">👑</div>
          <div className={clsx("absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-[charFloat_6s_ease-in-out_infinite]", dim(top))}>
            {top ? <CharacterAvatar player={top} size="lg" className="w-[180px] h-[180px]" /> : <div className="w-[180px] h-[180px] rounded-full bg-white/5" />}
          </div>
          <div className={clsx("relative z-30 flex flex-col items-center mt-[120px] mb-3.5", dim(top))}>
            <div className="flex items-center gap-2.5 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1 backdrop-blur-md">
              <div className="text-[20px] font-black text-white">{top?.name}</div>
              <div className="bg-gradient-to-br from-yellow to-orange text-bg font-mono text-[11px] font-bold rounded-lg px-2.5 py-1">#1</div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-md">
              <span className="font-mono text-[18px] font-bold text-yellow">🪙 {top ? playerTotal(top) : 0}</span>
              <span className="text-[12px] text-yellow/60 font-bold">TOKEN</span>
              {top && playerTotal(top) !== top.tokens && <span className="text-[10px] text-yellow/40 font-mono">{top.tokens} frei</span>}
            </div>
          </div>
        </div>
        <div className="relative z-20 flex gap-2 px-4 pb-2.5 shrink-0">
          {sorted[1] && (
            <div className={clsx("flex-1 bg-card border border-[#C0C0DC]/30 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden", dim(sorted[1]))}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C8C8F0]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#C8C8F0] bg-[#C8C8F0]/10 border border-[#C8C8F0]/25">#2 🥈</div>
              <div className="w-9 h-9"><CharacterAvatar player={sorted[1]} size="sm" className="w-full h-full" /></div>
              <div className="text-[14px] font-black text-white text-center">{sorted[1].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{playerTotal(sorted[1])} TKN</div>
              {playerTotal(sorted[1]) !== sorted[1].tokens && <div className="text-[10px] text-muted font-mono">{sorted[1].tokens} frei</div>}
            </div>
          )}
          {sorted[2] && (
            <div className={clsx("flex-1 bg-card border border-[#CD7F32]/35 rounded-2xl p-3 flex flex-col items-center gap-1.5 relative overflow-hidden", dim(sorted[2]))}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CD7F32]/50 to-transparent" />
              <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md text-[#CD7F32] bg-[#CD7F32]/10 border border-[#CD7F32]/25">#3 🥉</div>
              <div className="w-9 h-9"><CharacterAvatar player={sorted[2]} size="sm" className="w-full h-full" /></div>
              <div className="text-[14px] font-black text-white text-center">{sorted[2].name}</div>
              <div className="font-mono text-[15px] font-bold text-green">{playerTotal(sorted[2])} TKN</div>
              {playerTotal(sorted[2]) !== sorted[2].tokens && <div className="text-[10px] text-muted font-mono">{sorted[2].tokens} frei</div>}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px] pt-1 relative z-10">
          {sorted.slice(3).map((p, i) => {
            const total = playerTotal(p);
            return (
            <div key={p.id} className={clsx("flex items-center gap-3 bg-card border rounded-[14px] p-3 mb-1.5 relative",
              p.id === me.id ? "border-green/40 bg-green/5" : "border-border hover:border-blue/30", total === 0 && "border-red/25", dim(p))}>
              {p.id === me.id && <div className="absolute left-0 top-1/5 bottom-1/5 w-[3px] rounded-r-sm bg-green shadow-[0_0_10px_rgba(230,180,60,1)]" />}
              <div className={clsx("font-mono text-[14px] font-bold w-6 text-center", p.id === me.id ? "text-yellow" : total === 0 ? "text-red" : "text-muted")}>#{i+4}</div>
              <div className="w-9 h-9 rounded-lg bg-input flex items-center justify-center border border-border shrink-0 overflow-hidden">
                <CharacterAvatar player={p} size="sm" className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-black text-white truncate">{p.name}</span>
                  {p.id === me.id && <span className="text-[10px] text-green font-black shrink-0">(Du)</span>}
                  {accIcons(p)}
                </div>
                {(p.streakLevel === 'damn_hot' || p.streakLevel === 'on_fire') && (
                  <span className={clsx(
                    'text-[9px] font-black',
                    p.streakLevel === 'damn_hot' ? 'text-orange-400' : 'text-orange-300',
                  )}>
                    {p.streakLevel === 'damn_hot' ? '🔥🔥 DAMN HOT' : `🔥 ${p.currentStreak}er Streak`}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end">
                <span className={clsx("font-mono text-[15px] font-bold", total === 0 ? "text-red" : "text-white")}>{total}</span>
                {total !== p.tokens && <span className="text-[10px] text-muted font-mono">{p.tokens} frei</span>}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {activeTab === 'dashboard' && (
        <div className="absolute top-0 left-0 right-0 h-[290px] z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,110,255,.35)_0%,transparent_60%)]" />
      )}
      {activeTab === 'leaderboard' && (
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,212,71,.18)_0%,transparent_40%)]" />
      )}
      {activeTab === 'spielplan' && (
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(230,180,60,.12)_0%,transparent_50%)]" />
      )}

      {/* Top Bar */}
      {activeTab === 'dashboard' && (
        <div className="relative z-30 px-5 pt-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
            <span className="text-[14px]">🎰</span>
            <span className="font-mono text-[11px] font-bold text-yellow">{totalJackpot} TKN</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/rules')} className="w-8 h-8 rounded-full bg-yellow/10 border border-yellow/30 flex items-center justify-center text-yellow hover:bg-yellow/20 transition-colors">
              <HelpCircle className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={() => navigate('/admin')} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors">
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => navigate('/profile')} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors">
              <User className="w-3.5 h-3.5" />
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
            <div onClick={() => navigate('/profile')} className="w-[200px] h-[200px] cursor-pointer select-none">
              <CharacterAvatar player={me} size="lg" className="w-full h-full" />
            </div>
          </div>
          <div className="relative z-30 flex flex-col items-center gap-3 mt-[220px]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Konto</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-green">{me.tokens + bets.filter(b => b.playerId === me.id && markets.find(m => m.id === b.marketId)?.status === 'open').reduce((s,b)=>s+b.amount,0)}</span>
                </div>
              </div>
              <div className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
                <span className="text-[9px] text-muted font-bold uppercase tracking-wider mb-0.5">Frei</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">🪙</span>
                  <span className="font-mono text-[16px] font-bold text-white">{me.tokens}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buyback / Low-Balance Banner */}
      {activeTab === 'dashboard' && !me.buybackUsed && me.tokens < 25 && (
        <div className="relative z-30 mx-4 mb-2">
          <div className="bg-red/10 border border-red/35 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-[24px] shrink-0">💸</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-black text-red leading-tight">Guthaben fast aufgebraucht!</div>
              <div className="text-[11px] text-muted/80 mt-0.5">
                {me.tokens === 0
                  ? 'Du bist bankrott. Buyback beim Admin möglich.'
                  : `Nur noch ${me.tokens} Cr. — Überlebensmodus aktiv.`}
              </div>
            </div>
            <span className="text-[10px] font-black text-red/70 shrink-0">Buyback?</span>
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
      {activeTab === 'spielplan' && <SpielplanTab />}
      {activeTab === 'my-bets' && renderMyBets()}
      {activeTab === 'leaderboard' && renderLeaderboard()}

      {/* Bottom Nav */}
      <div className="bg-[#050912]/95 backdrop-blur-xl border-t border-border px-1 pb-3 shrink-0 sticky bottom-0 z-40">
        <div className="grid grid-cols-4">
          {([
            ['dashboard', 'Home',      LayoutDashboard],
            ['spielplan', 'Spielplan', Calendar],
            ['my-bets',   'Wetten',    Target],
            ['leaderboard','Liga',     Trophy],
          ] as const).map(([tab, label, Icon]) => (
            <div key={tab} onClick={() => setActiveTab(tab)} className="flex flex-col items-center px-1 pt-3 pb-3 gap-1.5 cursor-pointer relative">
              <Icon className={clsx('w-5 h-5', activeTab === tab ? 'text-green' : 'text-muted')} strokeWidth={2} />
              <span className={clsx('text-[9px] font-black tracking-[0.06em] uppercase', activeTab === tab ? 'text-green' : 'text-muted')}>
                {label}
              </span>
              {activeTab === tab && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-sm bg-green shadow-[0_0_10px_rgba(230,180,60,0.5)]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BET MODAL ─────────────────────────────────────────────────────────── */}
      {selectedMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-3 py-4">
          <div className="bg-bg rounded-[28px] flex flex-col relative overflow-hidden border border-border shadow-[0_20px_60px_rgba(0,0,0,0.7)] w-full max-w-[430px] max-h-[90vh]">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_-5%,rgba(230,180,60,.2)_0%,transparent_50%)]" />
            <div className="relative z-10 flex flex-col">
              

              {/* Header */}
              <div className="p-4 px-5 border-b border-border flex justify-between items-start shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">
                    {selectedMarket.type === 'combo'
                      ? `🔗 COMBO · ${selectedMarket.multiplier}× Multiplikator`
                      : selectedMarket.comboGroupId
                        ? `🔗 COMBO · ${selectedMarket.comboGroupLabel ?? 'Combo'}`
                        : `${selectedMarket.type} · Markt`}
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
                    {selectedMarket.multiSelect ? (
                      <>
                        <div className="text-[10px] font-black text-blue2 tracking-[0.12em] uppercase mb-1.5">☑️ Multiple Choice</div>
                        <div className="text-[11px] text-muted mb-1">
                          Kreuze alle zutreffenden Antworten an. Gewinn nur bei <b className="text-white">exakt</b> richtiger Auswahl — der Topf wird unter den exakten Treffern aufgeteilt.
                        </div>
                        <div className="text-[12px] text-muted">Topf: <b className="text-white">{bets.filter(b => b.marketId === selectedMarket.id).reduce((s, b) => s + b.amount, 0)} TKN</b> · {bets.filter(b => b.marketId === selectedMarket.id).length} Tipps</div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>

                  {/* Bets list */}
                  <div className="p-3.5 px-5 border-b border-border max-h-[110px] overflow-y-auto no-scrollbar">
                    <div className="text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2.5">Einsätze</div>
                    {bets.filter(b => b.marketId === selectedMarket.id).map(b => {
                      const p = players.find(pl => pl.id === b.playerId);
                      const foundIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                      const optIdx = foundIdx >= 0 ? foundIdx : 0;
                      if (!p) return null;
                      return (
                        <div key={b.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                          <div className="w-[30px] h-[30px] rounded-lg bg-card flex items-center justify-center shrink-0 overflow-hidden">
                            <CharacterAvatar player={p} size="sm" className="w-full h-full" />
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
                      <input type="range"
                        min={selectedMarket.minBet ?? 1}
                        max={selectedMarket.maxBet && selectedMarket.maxBet > 0
                          ? Math.min(selectedMarket.maxBet, me.tokens)
                          : Math.min(500, me.tokens)}
                        value={Math.min(betAmount, me.tokens)} onChange={e => setBetAmount(parseInt(e.target.value))}
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
                  {!selectedExpired && (() => {
                    const myBet = bets.find(b => b.marketId === selectedMarket.id && b.playerId === me.id);
                    const isChanging = changingBetMarket === selectedMarket.id;
                    if (myBet && !isChanging) {
                      return (
                        <div className="p-4 px-5 pb-7 text-center">
                          <div className="bg-green/10 border border-green/25 rounded-2xl p-4">
                            <div className="text-[13px] font-black text-green">✓ Deine Wette</div>
                            <div className="text-[15px] font-black text-white mt-1">
                              {myBet.amount} TKN auf „{myBet.optionLabel}"
                            </div>
                            {selectedMarket.status === 'open' && (
                              <button onClick={() => { setChangingBetMarket(selectedMarket.id); setBetAmount(myBet.amount); }}
                                className="mt-3 text-[11px] font-black text-yellow border border-yellow/30 bg-yellow/10 rounded-lg px-3 py-1.5 hover:bg-yellow/20 transition-colors cursor-pointer">
                                ✏️ Wette ändern
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    if (selectedMarket.multiSelect) {
                      const pick = mcPick[selectedMarket.id] ?? [];
                      const toggle = (id: string) => setMcPick(s => {
                        const cur = s[selectedMarket.id] ?? [];
                        return { ...s, [selectedMarket.id]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
                      });
                      const labels = selectedMarket.options.filter(o => pick.includes(o.id)).map(o => o.label).join(' + ');
                      return (
                        <div className="p-4 px-5 pb-7 flex flex-col gap-2">
                          <div className="text-[11px] font-black text-blue2">☑️ Mehrere ankreuzbar — exakt richtig gewinnt</div>
                          <div className={clsx('grid gap-2', selectedMarket.options.length > 2 ? 'grid-cols-2' : 'grid-cols-2')}>
                            {selectedMarket.options.map(opt => {
                              const on = pick.includes(opt.id);
                              return (
                                <button key={opt.id} onClick={() => toggle(opt.id)}
                                  className={clsx('rounded-[14px] cursor-pointer font-sans border-2 transition-all py-2.5 px-2 text-[13px] font-black',
                                    on ? 'border-green/60 bg-green/15 text-green' : 'border-border bg-transparent text-white hover:border-white/30')}>
                                  {on ? '☑ ' : '☐ '}{opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            disabled={pick.length === 0 || me.tokens + (myBet?.amount ?? 0) < betAmount}
                            onClick={() => {
                              const key = buildSelectionKey(pick);
                              if (isChanging) { changeBet(selectedMarket.id, key, labels, betAmount); setChangingBetMarket(null); setSelectedMarket(null); }
                              else handleBet(key, labels);
                              setMcPick(s => ({ ...s, [selectedMarket.id]: [] }));
                            }}
                            className="mt-1 w-full p-3.5 rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(230,180,60,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">
                            {isChanging ? 'Auswahl übernehmen' : `Wette setzen (${pick.length})`}
                          </button>
                        </div>
                      );
                    }
                    return (
                    <>
                      {isChanging && (
                        <div className="px-5 pt-3 text-[11px] font-black text-yellow text-center">
                          ✏️ Wette wird geändert — wähle eine neue Option
                        </div>
                      )}
                      <div className={clsx('p-4 px-5 pb-7 grid gap-2 shrink-0', selectedMarket.options.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}>
                        {selectedMarket.options.map((opt, i) => {
                          const payout = calcPayout(selectedMarket, opt.id, betAmount);
                          const handleClick = isChanging
                            ? () => { changeBet(selectedMarket.id, opt.id, opt.label, betAmount); setChangingBetMarket(null); setSelectedMarket(null); }
                            : () => handleBet(opt.id, opt.label);
                          return (
                            <button key={opt.id} onClick={handleClick} disabled={me.tokens + (myBet?.amount ?? 0) < betAmount}
                              className={clsx('rounded-[18px] cursor-pointer font-sans border-2 transition-all hover:-translate-y-0.5 disabled:opacity-50 flex flex-col items-center justify-center py-3 px-2 gap-0.5',
                                i === 0 ? `border-transparent bg-gradient-to-br from-green to-[#B8860B] text-bg ${OPT_SHADOW[0]}` : `bg-transparent ${OPT_TEXT[i]} ${OPT_BORDER[i]} ${OPT_HOVER[i]}`)}>
                              <span className="text-[14px] font-black leading-none">{opt.label}</span>
                              <span className={clsx('text-[10px] font-bold', i === 0 ? 'text-bg/70' : 'opacity-60')}>~{payout} TKN</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                    );
                  })()}
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

      {/* ── CONFIRM TIP DIALOG (Jackpot-Sonderrunde, gratis) ──────────────────── */}
      {confirmTip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-yellow/25 rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-yellow/10 border border-yellow/20 flex items-center justify-center text-[28px] mb-4">🎰</div>
            <div className="text-[20px] font-black text-white mb-2">Gratis-Tipp abgeben</div>
            <div className="text-[14px] text-muted mb-6 leading-relaxed">
              {confirmTip.question}<br />
              <b className="text-yellow">„{confirmTip.optionLabel}"</b>
              <br /><span className="text-[12px] text-green/90 font-bold mt-2 block">Kein Einsatz — kostenlos!</span>
              <span className="text-[12px] text-muted block mt-0.5">Änderbar bis zum 1. WM-Spiel.</span>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmTip(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={() => { placeTip(confirmTip.marketId, confirmTip.optionId, confirmTip.optionLabel); setConfirmTip(null); }}
                className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_0_15px_rgba(255,212,71,0.4)] transition-all">Tippen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}