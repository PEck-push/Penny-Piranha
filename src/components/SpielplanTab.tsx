import { useState } from 'react';
import { clsx } from 'clsx';
import { useStore, Market, getMarketTotal } from '../store';
import { WM2026_GROUP_SCHEDULE, WmMatch } from '../data/wm2026Schedule';

const GROUP_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

const COUNTRY_FLAGS: Record<string, string> = {
  'Mexiko': '🇲🇽', 'Polen': '🇵🇱', 'Südkorea': '🇰🇷', 'Katar': '🇶🇦',
  'Kanada': '🇨🇦', 'Belgien': '🇧🇪', 'Ägypten': '🇪🇬', 'Neuseeland': '🇳🇿',
  'USA': '🇺🇸', 'Österreich': '🇦🇹', 'Uruguay': '🇺🇾', 'Saudi-Arabien': '🇸🇦',
  'Argentinien': '🇦🇷', 'Kroatien': '🇭🇷', 'Nigeria': '🇳🇬', 'Panama': '🇵🇦',
  'Frankreich': '🇫🇷', 'Senegal': '🇸🇳', 'Iran': '🇮🇷', 'Honduras': '🇭🇳',
  'Brasilien': '🇧🇷', 'Schweiz': '🇨🇭', 'Kamerun': '🇨🇲', 'Jordanien': '🇯🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Niederlande': '🇳🇱', 'Ghana': '🇬🇭', 'Curacao': '🇨🇼',
  'Spanien': '🇪🇸', 'Japan': '🇯🇵', 'Marokko': '🇲🇦', 'Costa Rica': '🇨🇷',
  'Deutschland': '🇩🇪', 'Kolumbien': '🇨🇴', 'Australien': '🇦🇺', 'Usbekistan': '🇺🇿',
  'Portugal': '🇵🇹', 'Elfenbeinküste': '🇨🇮', 'Kap Verde': '🇨🇻',
  'Italien': '🇮🇹', 'Ecuador': '🇪🇨', 'Tunesien': '🇹🇳', 'Jamaika': '🇯🇲',
  'Algerien': '🇩🇿', 'Bolivien': '🇧🇴',
  'Mexiko B': '🇲🇽', 'Niederlande B': '🇳🇱', 'USA B': '🇺🇸',
};

const flag = (team: string) => COUNTRY_FLAGS[team] ?? '🏴';

// Convert UTC timestamp to CEST display (UTC+2, no DST handling needed — all matches in summer)
const toCEST = (ts: number) => {
  const d = new Date(ts + 2 * 60 * 60 * 1000);
  const day  = d.getUTCDate().toString().padStart(2, '0');
  const mon  = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const h    = d.getUTCHours().toString().padStart(2, '0');
  const min  = d.getUTCMinutes().toString().padStart(2, '0');
  return { date: `${day}.${mon}.`, time: `${h}:${min}` };
};

// WM-specific option colours: home=blue, draw=yellow, away=red
const OPT_HEX    = ['#3B6EFF', '#FFD447', '#FF3D5A'];
const OPT_TEXT   = ['text-blue2', 'text-yellow', 'text-red'];
const OPT_BG     = ['bg-blue/10', 'bg-yellow/10', 'bg-red/10'];
const OPT_BORDER = ['border-blue2/40', 'border-yellow/40', 'border-red/40'];

export default function SpielplanTab() {
  const [activeGroup, setActiveGroup] = useState('C'); // Österreich-Gruppe
  const [selectedMatch, setSelectedMatch] = useState<WmMatch | null>(null);
  const [betAmount, setBetAmount] = useState(50);
  const [confirmBet, setConfirmBet] = useState<{
    marketId: string; optionId: string; optionLabel: string; amount: number;
  } | null>(null);

  const markets     = useStore(s => s.markets);
  const bets        = useStore(s => s.bets);
  const players     = useStore(s => s.players);
  const currentUser = useStore(s => s.currentUser);
  const jackpot     = useStore(s => s.jackpot);
  const placeBet    = useStore(s => s.placeBet);
  const logoutAuth  = useStore(s => s.logoutAuth);
  const me          = players.find(p => p.id === currentUser);

  const [showProfile, setShowProfile] = useState(false);

  const now = Date.now();

  const groupMatches = WM2026_GROUP_SCHEDULE
    .filter(m => m.groupLabel === `Gruppe ${activeGroup}`)
    .sort((a, b) => a.matchday - b.matchday || a.kickoffAt - b.kickoffAt);

  const getMarket = (match: WmMatch): Market | undefined =>
    markets.find(m => m.matchId === match.matchId);

  const getMyBet = (marketId: string) =>
    bets.find(b => b.marketId === marketId && b.playerId === currentUser);

  const selectedMarket = selectedMatch ? getMarket(selectedMatch) : undefined;
  const selectedMyBet  = selectedMarket ? getMyBet(selectedMarket.id) : undefined;
  const selectedTotal  = selectedMarket ? getMarketTotal(selectedMarket) : 0;

  const closeBetSheet = () => {
    setSelectedMatch(null);
    setConfirmBet(null);
    setBetAmount(50);
  };

  const handleBet = (marketId: string, optionId: string, optionLabel: string) => {
    if (!me || me.tokens < betAmount) return;
    setConfirmBet({ marketId, optionId, optionLabel, amount: betAmount });
  };

  const executeBet = () => {
    if (!confirmBet || !me || me.tokens < confirmBet.amount) return;
    placeBet(confirmBet.marketId, confirmBet.optionId, confirmBet.optionLabel, confirmBet.amount);
    closeBetSheet();
  };

  if (!me) return null;

  // ─── MATCH CARD ───────────────────────────────────────────────────────────────
  const MatchCard = ({ match }: { match: WmMatch }) => {
    const market   = getMarket(match);
    const myBet    = market ? getMyBet(market.id) : undefined;
    const { date, time } = toCEST(match.kickoffAt);
    const poolTotal = market ? getMarketTotal(market) : 0;
    const isOpen   = market?.status === 'open';
    const isLocked = market?.status === 'locked';
    const isResolved = market?.status === 'resolved';
    const isAustria = match.teamA === 'Österreich' || match.teamB === 'Österreich';

    return (
      <div
        onClick={() => isOpen ? setSelectedMatch(match) : undefined}
        className={clsx(
          'bg-card border rounded-[16px] p-3.5 mb-2 relative overflow-hidden transition-all',
          isOpen     ? 'border-blue2/35 cursor-pointer hover:border-blue2/60 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(59,110,255,0.15)]' : 'border-border',
          myBet      ? 'border-yellow/35' : '',
          isAustria  ? 'border-[#EF3340]/30' : '',
        )}
      >
        {isAustria && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#EF3340]/70 to-transparent" />
        )}
        {isOpen && !isAustria && !myBet && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue2/40 to-transparent" />
        )}

        <div className="flex items-center gap-3">
          {/* Date + time column */}
          <div className="flex flex-col items-center w-[42px] shrink-0 gap-0.5">
            <span className="text-[9px] font-bold text-muted leading-none">{date}</span>
            <span className="font-mono text-[14px] font-black text-white leading-none">{time}</span>
            <span className="text-[8px] font-bold text-muted/50 leading-none">CEST</span>
          </div>

          {/* Teams */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-[18px] leading-none shrink-0">{flag(match.teamA)}</span>
                <span className="text-[13px] font-black text-white leading-none truncate">{match.teamA}</span>
              </div>
              <span className="text-[9px] font-black text-muted/50 shrink-0">VS</span>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                <span className="text-[13px] font-black text-white leading-none truncate text-right">{match.teamB}</span>
                <span className="text-[18px] leading-none shrink-0">{flag(match.teamB)}</span>
              </div>
            </div>

            {/* Pool bar */}
            {market && poolTotal > 0 && (
              <div className="h-1.5 rounded-full overflow-hidden flex">
                {market.options.map((opt, i) => (
                  <div key={opt.id} className="h-full transition-all duration-500"
                    style={{ width: `${(opt.pool / poolTotal) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                ))}
              </div>
            )}
          </div>

          {/* Status / right column */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 ml-1">
            {isResolved && market?.winningOptionId && (() => {
              const wIdx = market.options.findIndex(o => o.id === market.winningOptionId);
              const wOpt = market.options[wIdx];
              return (
                <span className={clsx('text-[10px] font-black px-2 py-0.5 rounded-md border', OPT_BG[wIdx], OPT_TEXT[wIdx], OPT_BORDER[wIdx])}>
                  ✓ {wOpt?.label}
                </span>
              );
            })()}
            {isLocked && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-muted border border-white/10">🔒 Live</span>
            )}
            {isOpen && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-green/10 text-green border border-green/25">● Offen</span>
            )}
            {!market && match.kickoffAt > now && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-muted/60 border border-white/8">Bald</span>
            )}
            {isOpen && poolTotal > 0 && (
              <span className="text-[9px] font-bold text-muted">{poolTotal} TKN</span>
            )}
          </div>
        </div>

        {myBet && (
          <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-[10px] text-muted">Mein Tipp</span>
            <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-0.5">
              🪙 {myBet.amount} → {myBet.optionLabel}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Group's 4 unique teams
  const groupTeams = [...new Set([
    ...groupMatches.map(m => m.teamA),
    ...groupMatches.map(m => m.teamB),
  ])].slice(0, 4);

  return (
    <>
      {/* ── HEADER ──────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-3.5 pb-0 shrink-0 flex items-center justify-between mb-3">
        <div className="text-[22px] font-black text-white">Spielplan ⚽</div>
        {me && (
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-2 pr-3 py-1.5 hover:bg-white/10 transition-colors"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
              {me.avatar ? <img src={me.avatar} className="w-full h-full object-cover" alt="" /> : null}
            </div>
            <span className="text-[11px] font-black text-white/80">{me.name ?? me.firstName}</span>
          </button>
        )}
      </div>

      {/* ── PROFILE SHEET ───────────────────────────────────────────────────────── */}
      {showProfile && me && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowProfile(false)} />
          <div className="relative z-10 bg-bg border border-border border-b-0 rounded-t-[28px] w-full max-w-[430px] shadow-[0_-20px_60px_rgba(0,0,0,0.75)] pb-10">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>
            <div className="px-6 py-4 flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                {me.avatar
                  ? <img src={me.avatar} className="w-full h-full object-contain" alt="" />
                  : <div className="w-full h-full flex items-center justify-center text-[24px]">👤</div>
                }
              </div>
              <div>
                <div className="text-[18px] font-black text-white">{me.name}</div>
                {me.email && <div className="text-[12px] text-muted mt-0.5">{me.email}</div>}
              </div>
              <div className="flex gap-3 w-full text-center">
                <div className="flex-1 bg-card border border-border rounded-xl py-3">
                  <div className="text-[9px] font-black text-muted uppercase tracking-wider mb-0.5">Guthaben</div>
                  <div className="font-mono text-[16px] font-bold text-yellow">🪙 {me.tokens}</div>
                </div>
                <div className="flex-1 bg-card border border-border rounded-xl py-3">
                  <div className="text-[9px] font-black text-muted uppercase tracking-wider mb-0.5">Streak</div>
                  <div className="font-mono text-[16px] font-bold text-orange-400">
                    {me.streakLevel === 'damn_hot' ? '🔥🔥' : me.streakLevel === 'on_fire' ? '🔥' : '⬜'}{' '}
                    {me.currentStreak ?? 0}
                  </div>
                </div>
              </div>
              <button
                onClick={() => logoutAuth()}
                className="w-full p-3.5 border border-red/30 rounded-xl bg-red/10 font-sans text-[14px] font-black text-red cursor-pointer hover:bg-red/20 transition-colors mt-1"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GROUP TABS ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 shrink-0">

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {GROUP_LABELS.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={clsx(
                'flex-col items-center justify-center shrink-0 w-9 h-9 rounded-xl font-black text-[13px] transition-all border flex',
                activeGroup === g
                  ? 'bg-blue/20 border-blue2/60 text-blue2 shadow-[0_0_14px_rgba(59,110,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-muted hover:text-white',
                g === 'C' && activeGroup !== g ? 'border-[#EF3340]/35' : '',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── GROUP HEADER ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 mt-2.5 mb-2 shrink-0">
        <div className="bg-card border border-border rounded-[14px] px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">
            Gruppe {activeGroup}
          </span>
          {activeGroup === 'C' && (
            <span className="text-[10px] font-black text-[#EF3340] bg-[#EF3340]/10 border border-[#EF3340]/25 rounded-full px-2 py-0.5">
              🇦🇹 AUT
            </span>
          )}
          {groupTeams.map(t => (
            <span key={t} className="text-[12px] font-bold text-white/80 flex items-center gap-1">
              {flag(t)} {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── MATCHES ─────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px]">
        {[1, 2, 3].map(md => {
          const mdMatches = groupMatches.filter(m => m.matchday === md);
          if (mdMatches.length === 0) return null;
          return (
            <div key={md}>
              <div className="text-[11px] font-black text-muted uppercase tracking-[0.1em] mb-2 mt-1">
                Spieltag {md}
              </div>
              {mdMatches.map(match => <MatchCard key={match.matchId} match={match} />)}
            </div>
          );
        })}

        {groupMatches.length === 0 && (
          <div className="flex flex-col items-center gap-3 mt-12 text-center px-6">
            <div className="text-[40px]">📅</div>
            <div className="text-[16px] font-black text-muted">Keine Spiele gefunden</div>
          </div>
        )}
      </div>

      {/* ── BET SHEET (slide up) ───────────────────────────────────────────────── */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={closeBetSheet} />
          <div className="relative z-10 bg-bg border border-border border-b-0 rounded-t-[28px] w-full max-w-[430px] max-h-[88vh] overflow-y-auto no-scrollbar shadow-[0_-20px_60px_rgba(0,0,0,0.75)]">
            {/* Accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue2/70 to-transparent rounded-t-[28px]" />

            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Match header */}
            <div className="px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">
                  WM 2026 · Gruppe {activeGroup} · Spieltag {selectedMatch.matchday}
                </span>
                <button onClick={closeBetSheet} className="text-muted hover:text-white text-[20px] leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5">
                  ×
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                  <span className="text-[28px] leading-none">{flag(selectedMatch.teamA)}</span>
                  <span className="text-[15px] font-black text-white truncate max-w-full">{selectedMatch.teamA}</span>
                </div>

                <div className="flex flex-col items-center shrink-0 px-2">
                  <span className="text-[10px] font-black text-muted/60 mb-0.5">VS</span>
                  <span className="text-[11px] font-bold text-muted">{toCEST(selectedMatch.kickoffAt).date}</span>
                  <span className="font-mono text-[14px] font-black text-white">{toCEST(selectedMatch.kickoffAt).time}</span>
                  <span className="text-[9px] text-muted/60">CEST</span>
                </div>

                <div className="flex flex-col items-end gap-1 flex-1 min-w-0">
                  <span className="text-[28px] leading-none">{flag(selectedMatch.teamB)}</span>
                  <span className="text-[15px] font-black text-white truncate max-w-full text-right">{selectedMatch.teamB}</span>
                </div>
              </div>
            </div>

            {/* ── No market yet ── */}
            {!selectedMarket && (
              <div className="p-8 flex flex-col items-center text-center">
                <div className="text-[44px] mb-3">⏳</div>
                <div className="text-[16px] font-black text-muted">Markt noch nicht geöffnet</div>
                <div className="text-[12px] text-muted/60 mt-1">Märkte öffnen 48h vor Anstoß</div>
              </div>
            )}

            {/* ── Already bet ── */}
            {selectedMarket && selectedMyBet && (
              <div className="p-5">
                {selectedTotal > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Aktuelle Quoten</div>
                    <div className="h-3 rounded-full overflow-hidden flex mb-2">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500"
                          style={{ width: `${(opt.pool / selectedTotal) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex justify-between">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="flex-1 text-center">
                          <div className={clsx('text-[12px] font-black', OPT_TEXT[i])}>
                            {Math.round((opt.pool / selectedTotal) * 100)}%
                          </div>
                          <div className="text-[9px] text-muted">{opt.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bet list (post-lock transparency) */}
                {selectedMarket.status === 'locked' || selectedMarket.status === 'resolved' ? (
                  <div className="mb-4 max-h-[160px] overflow-y-auto no-scrollbar">
                    <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Alle Tipps</div>
                    {bets.filter(b => b.marketId === selectedMarket.id).map(b => {
                      const p = players.find(pl => pl.id === b.playerId);
                      const optIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                      return (
                        <div key={b.id} className="flex items-center gap-2 py-1.5 border-b border-border/60 last:border-0">
                          <div className="w-6 h-6 rounded-md bg-white/5 overflow-hidden shrink-0">
                            {p?.avatar ? <img src={p.avatar} className="w-full h-full object-cover" alt="" /> : null}
                          </div>
                          <span className="flex-1 text-[12px] font-bold text-white truncate">{p?.name ?? '?'}</span>
                          <span className={clsx('text-[10px] font-black px-1.5 py-0.5 rounded-md border', OPT_BG[optIdx], OPT_TEXT[optIdx], OPT_BORDER[optIdx])}>
                            {b.optionLabel}
                          </span>
                          <span className="font-mono text-[11px] text-muted">{b.amount}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="bg-yellow/10 border border-yellow/25 rounded-2xl p-4 text-center">
                  <div className="text-[24px] mb-1">🔒</div>
                  <div className="text-[14px] font-black text-yellow">Tipp gespeichert!</div>
                  <div className="text-[12px] text-muted mt-1">
                    <b className="text-white">{selectedMyBet.amount} TKN</b> auf{' '}
                    <b className="text-yellow">„{selectedMyBet.optionLabel}"</b>
                  </div>
                </div>
              </div>
            )}

            {/* ── Bet form ── */}
            {selectedMarket && !selectedMyBet && selectedMarket.status === 'open' && (
              <div className="p-4 pb-8">
                {/* Odds */}
                {selectedTotal > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Aktuelle Verteilung</div>
                    <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500"
                          style={{ width: `${(opt.pool / selectedTotal) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex justify-between">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="flex-1 text-center">
                          <div className={clsx('text-[11px] font-black', OPT_TEXT[i])}>
                            {Math.round((opt.pool / selectedTotal) * 100)}%
                          </div>
                          <div className="text-[9px] text-muted">{opt.pool} TKN</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Slider */}
                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-black text-muted uppercase tracking-[0.1em]">Einsatz</span>
                    <span className="font-mono text-[20px] font-bold text-yellow">{betAmount} <span className="text-[13px] text-muted">TKN</span></span>
                  </div>
                  <input
                    type="range"
                    min={selectedMarket.minBet ?? 10}
                    max={selectedMarket.maxBet && selectedMarket.maxBet > 0
                      ? Math.min(selectedMarket.maxBet, me.tokens)
                      : Math.min(500, me.tokens)}
                    value={Math.min(betAmount, me.tokens)}
                    onChange={e => setBetAmount(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-input rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg"
                  />
                  <div className="flex justify-between text-[10px] text-muted/60 mt-1">
                    <span>Min {selectedMarket.minBet ?? 10}</span>
                    <span>Guthaben: {me.tokens} TKN</span>
                  </div>
                </div>

                {/* Bet buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {selectedMarket.options.map((opt, i) => {
                    const simOpt   = opt.pool + betAmount;
                    const simTotal = selectedTotal + betAmount + jackpot;
                    const payout   = simOpt === 0 ? 0 : Math.floor((betAmount / simOpt) * simTotal);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleBet(selectedMarket.id, opt.id, opt.label)}
                        disabled={me.tokens < betAmount}
                        className={clsx(
                          'rounded-[16px] border-2 py-3 px-2 flex flex-col items-center gap-1 transition-all hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer font-sans',
                          i === 0 ? 'bg-blue/15 border-blue2/60 text-blue2 hover:bg-blue/25' :
                          i === 1 ? 'bg-yellow/10 border-yellow/50 text-yellow hover:bg-yellow/20' :
                                    'bg-red/10 border-red/50 text-red hover:bg-red/20',
                        )}
                      >
                        <span className="text-[13px] font-black leading-tight text-center w-full truncate px-1">
                          {opt.label}
                        </span>
                        <span className="text-[10px] font-bold opacity-60">~{payout}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG ────────────────────────────────────────────────────────── */}
      {confirmBet && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="text-[48px] mb-3">⚽</div>
            <div className="text-[20px] font-black text-white mb-2">Tipp abgeben?</div>
            <div className="text-[14px] text-muted mb-6 leading-relaxed">
              <b className="text-white">{confirmBet.amount} TKN</b> auf{' '}
              <b className="text-yellow">„{confirmBet.optionLabel}"</b>?
              <br />
              <span className="text-[11px] text-red/70 font-bold uppercase tracking-wider mt-2 block">
                Nicht rückgängig machbar!
              </span>
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
                className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_4px_20px_rgba(255,212,71,0.35)] hover:shadow-[0_6px_28px_rgba(255,212,71,0.45)] transition-all"
              >
                ⚽ Tippen!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
