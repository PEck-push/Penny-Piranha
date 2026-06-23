import { useState, useEffect, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { useStore, Market, getMarketTotal, ScheduleMatch } from '../store';
import { calcMarketPayoutPreview } from '../utils/credits';
import { WM2026_GROUP_SCHEDULE } from '../data/wm2026Schedule';
import { flag, deName, isAustriaTeam, toCEST } from '../utils/teams';
import CharacterAvatar from './CharacterAvatar';
import CoinIcon from './CoinIcon';
import { isAdminEmail } from '../config/admins';

type WmMatch = ScheduleMatch;

const GROUP_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// WM-specific option colours: home=blue, draw=yellow, away=red
const OPT_HEX    = ['#3B6EFF', '#FFD447', '#FF3D5A'];
const OPT_TEXT   = ['text-blue2', 'text-yellow', 'text-red'];
const OPT_BG     = ['bg-blue/10', 'bg-yellow/10', 'bg-red/10'];
const OPT_BORDER = ['border-blue2/40', 'border-yellow/40', 'border-red/40'];

export default function SpielplanTab() {
  const [activeGroup, setActiveGroup] = useState('A');
  const autoSwitched = useRef(false);
  const [selectedMatch, setSelectedMatch] = useState<WmMatch | null>(null);
  const [betAmount, setBetAmount] = useState(50);
  const [confirmBet, setConfirmBet] = useState<{
    marketId: string; optionId: string; optionLabel: string; amount: number; isChange?: boolean;
  } | null>(null);
  const [betPending, setBetPending] = useState(false);
  // Bestehende Wette aendern: nach Klick auf "Wette aendern" wird die Bet-Form
  // erneut angezeigt (Slider + Buttons), pre-filled mit dem aktuellen Einsatz.
  const [isChangingBet, setIsChangingBet] = useState(false);

  const markets     = useStore(s => s.markets);
  const liveBets    = useStore(s => s.bets);
  const historyBets = useStore(s => s.historyBets);
  const loadHistoryBetsForMarket = useStore(s => s.loadHistoryBetsForMarket);
  const players     = useStore(s => s.players);
  const currentUser = useStore(s => s.currentUser);
  const placeBet    = useStore(s => s.placeBet);
  const changeBet   = useStore(s => s.changeBet);
  const liveSchedule = useStore(s => s.schedule);
  const me          = players.find(p => p.id === currentUser);

  // Aktive Tipps live + bei Bedarf nachgeladene Historie eines aufgelösten Spiels.
  const bets = useMemo(() => {
    const map = new Map(historyBets.map(b => [b.id, b]));
    for (const b of liveBets) map.set(b.id, b);
    return [...map.values()];
  }, [liveBets, historyBets]);

  // Admin-Schalter: fremde Einzel-Tipps ausblenden (Admins sehen alles, eigener
  // Tipp bleibt). Liefert sichtbare Tipps + Anzahl der ausgeblendeten.
  const hideOthersBets = useStore(s => s.hideOthersBets);
  const isAdmin = me?.isAdmin || isAdminEmail(me?.email);
  const visibleBetsFor = (marketId: string) => {
    const all = bets.filter(b => b.marketId === marketId);
    if (hideOthersBets && !isAdmin) {
      const visible = all.filter(b => b.playerId === currentUser);
      return { visible, hidden: all.length - visible.length, total: all.length };
    }
    return { visible: all, hidden: 0, total: all.length };
  };

  const now = Date.now();

  // Use live schedule from Firestore (API import); fall back to placeholder.
  const schedule: WmMatch[] = liveSchedule.length > 0 ? liveSchedule : WM2026_GROUP_SCHEDULE;

  // Find the group containing Austria dynamically — works with both German and English team names.
  const austriaGroupLetter = GROUP_LABELS.find(g =>
    schedule.some(m => m.groupLabel === `Gruppe ${g}` && (isAustriaTeam(m.teamA) || isAustriaTeam(m.teamB)))
  );

  // Auto-switch to Austria's group once schedule is loaded (only once, not on manual navigation).
  useEffect(() => {
    if (!autoSwitched.current && austriaGroupLetter) {
      setActiveGroup(austriaGroupLetter);
      autoSwitched.current = true;
    }
  }, [austriaGroupLetter]);

  const groupMatches = schedule
    .filter(m => m.groupLabel === `Gruppe ${activeGroup}`)
    .sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0) || a.kickoffAt - b.kickoffAt);

  const getMarket = (match: WmMatch): Market | undefined =>
    markets.find(m => m.matchId === match.matchId);

  const getMyBet = (marketId: string) =>
    bets.find(b => b.marketId === marketId && b.playerId === currentUser);

  const selectedMarket = selectedMatch ? getMarket(selectedMatch) : undefined;
  // Detailansicht eines bereits aufgelösten/stornierten Spiels → dessen
  // ausgewertete Tipps gezielt nachladen (sie sind nicht mehr live im Store).
  useEffect(() => {
    if (selectedMarket && (selectedMarket.status === 'resolved' || selectedMarket.status === 'cancelled')) {
      loadHistoryBetsForMarket(selectedMarket.id);
    }
  }, [selectedMarket?.id, selectedMarket?.status, loadHistoryBetsForMarket]);
  const selectedMyBet  = selectedMarket ? getMyBet(selectedMarket.id) : undefined;
  const selectedTotal  = selectedMarket ? getMarketTotal(selectedMarket) : 0;

  const closeBetSheet = () => {
    setSelectedMatch(null);
    setConfirmBet(null);
    setBetAmount(50);
    setIsChangingBet(false);
  };

  const handleBet = (marketId: string, optionId: string, optionLabel: string) => {
    if (!me) return;
    // Beim Ändern zählt der bisherige Einsatz zum Budget (wird refundiert) —
    // sonst lässt sich ein Tipp bei 0 freiem Guthaben nicht reduzieren.
    const budget = me.tokens + (isChangingBet && selectedMyBet ? selectedMyBet.amount : 0);
    if (budget < betAmount) return;
    setConfirmBet({ marketId, optionId, optionLabel, amount: betAmount, isChange: isChangingBet });
  };

  const executeBet = async () => {
    if (betPending) return;
    if (!confirmBet || !me) return;
    // Bei Aenderung wird der alte Einsatz refundiert + neuer abgezogen;
    // Token-Check passiert serverseitig. Beim PlaceBet muss der volle Einsatz
    // jetzt verfuegbar sein.
    if (!confirmBet.isChange && me.tokens < confirmBet.amount) return;
    setBetPending(true);
    try {
      if (confirmBet.isChange) {
        await changeBet(confirmBet.marketId, confirmBet.optionId, confirmBet.optionLabel, confirmBet.amount);
      } else {
        await placeBet(confirmBet.marketId, confirmBet.optionId, confirmBet.optionLabel, confirmBet.amount);
      }
      closeBetSheet();
    } finally {
      setBetPending(false);
    }
  };

  if (!me) return null;

  // Beim Ändern einer Wette wird der bestehende Einsatz erstattet → verfügbares
  // Budget = freie Token + bisheriger Einsatz dieser Wette. Ohne das klebte der
  // Slider bei 0 Guthaben fest, und man konnte einen Tipp nicht reduzieren.
  const changeBudget = me.tokens + (isChangingBet && selectedMyBet ? selectedMyBet.amount : 0);

  const isFinished = (m: WmMatch) =>
    m.status === 'finished' || (m.scoreA != null && m.scoreB != null);

  // ─── MATCH CARD ───────────────────────────────────────────────────────────────
  const MatchCard = ({ match }: { match: WmMatch }) => {
    const market   = getMarket(match);
    const myBet    = market ? getMyBet(market.id) : undefined;
    const { date, time } = toCEST(match.kickoffAt);
    const poolTotal = market ? getMarketTotal(market) : 0;
    const isOpen   = market?.status === 'open';
    const isLocked = market?.status === 'locked';
    const isResolved = market?.status === 'resolved';
    const isAustria = isAustriaTeam(match.teamA) || isAustriaTeam(match.teamB);
    const finished = isFinished(match);
    const scorersA = (match.scorers ?? []).filter(s => s.team && s.team === match.teamA);
    const scorersB = (match.scorers ?? []).filter(s => s.team && s.team === match.teamB);
    const unassignedScorers = (match.scorers ?? []).filter(s => !s.team);

    return (
      <div
        onClick={() => isOpen ? setSelectedMatch(match) : undefined}
        className={clsx(
          'bg-card border rounded-[16px] p-3.5 mb-2 relative overflow-hidden transition-all',
          isOpen     ? 'border-blue2/35 cursor-pointer hover:border-blue2/60 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(59,110,255,0.15)]' : 'border-border',
          myBet      ? 'border-yellow/35' : '',
          isAustria  ? 'border-[#EF3340]/30' : '',
          finished   ? 'opacity-60' : '',
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
                <span className="text-[13px] font-black text-white leading-none truncate">{deName(match.teamA)}</span>
              </div>
              {finished
                ? <span className="font-mono text-[15px] font-black text-white shrink-0 px-1">{match.scoreA}<span className="text-muted">:</span>{match.scoreB}</span>
                : <span className="text-[9px] font-black text-muted/50 shrink-0">VS</span>}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                <span className="text-[13px] font-black text-white leading-none truncate text-right">{deName(match.teamB)}</span>
                <span className="text-[18px] leading-none shrink-0">{flag(match.teamB)}</span>
              </div>
            </div>

            {/* Pool bar */}
            {market && poolTotal > 0 && !finished && (
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
            {!market && !finished && match.kickoffAt > now && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-muted/60 border border-white/8">Bald</span>
            )}
            {finished && !isResolved && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-muted border border-white/10">Beendet</span>
            )}
            {isOpen && poolTotal > 0 && (
              <span className="text-[9px] font-bold text-muted">{poolTotal} TKN</span>
            )}
          </div>
        </div>

        {/* Goalscorers (only if API provided them) */}
        {finished && (match.scorers?.length ?? 0) > 0 && (
          <div className="mt-2.5 pt-2 border-t border-border/60 flex justify-between gap-3 text-[10px] text-muted">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {scorersA.map((s, i) => <span key={i} className="truncate">⚽ {s.player}{s.minute != null ? ` ${s.minute}'` : ''}</span>)}
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-right">
              {scorersB.map((s, i) => <span key={i} className="truncate">{s.player}{s.minute != null ? ` ${s.minute}'` : ''} ⚽</span>)}
            </div>
            {scorersA.length === 0 && scorersB.length === 0 && unassignedScorers.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {unassignedScorers.map((s, i) => <span key={i}>⚽ {s.player}{s.minute != null ? ` ${s.minute}'` : ''}</span>)}
              </div>
            )}
          </div>
        )}

        {myBet && (
          <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-[10px] text-muted">Mein Tipp</span>
            <span className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-2 py-0.5">
              <CoinIcon size={11} /> {myBet.amount} → {myBet.optionLabel}
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

  // ─── STANDINGS (computed from finished group matches) ──────────────────────────
  type Row = { team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
  const standings: Row[] = (() => {
    const table = new Map<string, Row>();
    groupTeams.forEach(t => table.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    groupMatches.forEach(m => {
      if (!isFinished(m) || m.scoreA == null || m.scoreB == null) return;
      const a = table.get(m.teamA), b = table.get(m.teamB);
      if (!a || !b) return;
      a.p++; b.p++;
      a.gf += m.scoreA; a.ga += m.scoreB;
      b.gf += m.scoreB; b.ga += m.scoreA;
      if (m.scoreA > m.scoreB)      { a.w++; a.pts += 3; b.l++; }
      else if (m.scoreA < m.scoreB) { b.w++; b.pts += 3; a.l++; }
      else                          { a.d++; b.d++; a.pts++; b.pts++; }
    });
    return [...table.values()].sort((x, y) =>
      y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
  })();
  const anyPlayed = standings.some(r => r.p > 0);

  const upcomingMatches = groupMatches.filter(m => !isFinished(m));
  const finishedMatches = groupMatches.filter(isFinished)
    .sort((a, b) => b.kickoffAt - a.kickoffAt);

  return (
    <>
      {/* ── HEADER ──────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-3.5 pb-0 shrink-0 flex items-center justify-between mb-3">
        <div className="text-[22px] font-black text-white">Spielplan ⚽</div>
      </div>

      {/* ── GROUP TABS ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 shrink-0">

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {GROUP_LABELS.map(g => (
            <button
              key={g}
              onClick={() => { autoSwitched.current = true; setActiveGroup(g); }}
              className={clsx(
                'flex-col items-center justify-center shrink-0 w-9 h-9 rounded-xl font-black text-[13px] transition-all border flex',
                activeGroup === g
                  ? 'bg-blue/20 border-blue2/60 text-blue2 shadow-[0_0_14px_rgba(59,110,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-muted hover:text-white',
                g === austriaGroupLetter && activeGroup !== g ? 'border-[#EF3340]/35' : '',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── GROUP STANDINGS TABLE ───────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 mt-2.5 mb-2 shrink-0">
        <div className="bg-card border border-border rounded-[14px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <span className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Tabelle Gruppe {activeGroup}</span>
            {activeGroup === austriaGroupLetter && austriaGroupLetter && (
              <span className="text-[9px] font-black text-[#EF3340] bg-[#EF3340]/10 border border-[#EF3340]/25 rounded-full px-2 py-0.5">🇦🇹 ÖSTERREICH</span>
            )}
            {!anyPlayed && <span className="text-[9px] text-muted/60 ml-auto">noch keine Spiele gewertet</span>}
          </div>
          <div className="px-3 pb-2.5">
            <div className="grid grid-cols-[14px_1fr_repeat(5,18px)_24px] gap-x-1 items-center text-[9px] font-black text-muted/60 uppercase tracking-wider px-1 pb-1 border-b border-border/60">
              <span>#</span><span>Team</span>
              <span className="text-center">Sp</span><span className="text-center">S</span>
              <span className="text-center">U</span><span className="text-center">N</span>
              <span className="text-center">TD</span><span className="text-right">Pkt</span>
            </div>
            {standings.map((r, i) => {
              const aut = isAustriaTeam(r.team);
              return (
                <div key={r.team}
                  className={clsx('grid grid-cols-[14px_1fr_repeat(5,18px)_24px] gap-x-1 items-center py-1 text-[11px] border-b border-border/40 last:border-0',
                    aut ? 'text-[#EF3340]' : 'text-white')}>
                  <span className="text-[9px] font-black text-muted">{i + 1}</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-[13px] shrink-0">{flag(r.team)}</span>
                    <span className="font-bold truncate">{deName(r.team)}</span>
                  </span>
                  <span className="text-center font-mono text-muted">{r.p}</span>
                  <span className="text-center font-mono">{r.w}</span>
                  <span className="text-center font-mono">{r.d}</span>
                  <span className="text-center font-mono">{r.l}</span>
                  <span className="text-center font-mono text-muted">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</span>
                  <span className="text-right font-mono font-black">{r.pts}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MATCHES ─────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 pb-[90px]">
        {upcomingMatches.length > 0 && (
          <>
            <div className="text-[11px] font-black text-muted uppercase tracking-[0.1em] mb-2 mt-1">Kommende Spiele</div>
            {upcomingMatches.map(match => <MatchCard key={match.matchId} match={match} />)}
          </>
        )}

        {finishedMatches.length > 0 && (
          <>
            <div className="text-[11px] font-black text-muted uppercase tracking-[0.1em] mb-2 mt-4">Beendet</div>
            {finishedMatches.map(match => <MatchCard key={match.matchId} match={match} />)}
          </>
        )}

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
          <div className="relative z-10 bg-bg border border-border border-b-0 rounded-t-[28px] w-full max-w-[430px] h-[92dvh] max-h-[92dvh] shadow-[0_-20px_60px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden">
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
                  <span className="text-[15px] font-black text-white truncate max-w-full">{deName(selectedMatch.teamA)}</span>
                </div>

                <div className="flex flex-col items-center shrink-0 px-2">
                  <span className="text-[10px] font-black text-muted/60 mb-0.5">VS</span>
                  <span className="text-[11px] font-bold text-muted">{toCEST(selectedMatch.kickoffAt).date}</span>
                  <span className="font-mono text-[14px] font-black text-white">{toCEST(selectedMatch.kickoffAt).time}</span>
                  <span className="text-[9px] text-muted/60">CEST</span>
                </div>

                <div className="flex flex-col items-end gap-1 flex-1 min-w-0">
                  <span className="text-[28px] leading-none">{flag(selectedMatch.teamB)}</span>
                  <span className="text-[15px] font-black text-white truncate max-w-full text-right">{deName(selectedMatch.teamB)}</span>
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

            {/* ── Already bet (Aenderungs-Modus zeigt stattdessen die Bet-Form unten) ── */}
            {selectedMarket && selectedMyBet && !isChangingBet && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {isKnockoutMarket(selectedMarket) && (
                  <div className="px-4 pt-3 shrink-0"><KnockoutHint /></div>
                )}

                {/* Pool: TKN + % (analog Wetten-Tab) */}
                {selectedTotal > 0 && (
                  <div className="p-4 pt-3 border-b border-border shrink-0">
                    <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Pool-Verteilung</div>
                    <div className="h-3 rounded-full overflow-hidden flex mb-2.5">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500"
                          style={{ width: `${(opt.pool / selectedTotal) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex justify-between gap-3">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className={clsx('flex flex-col gap-0.5 min-w-0',
                          i === 0 ? 'items-start' : i === selectedMarket.options.length - 1 ? 'items-end' : 'items-center')}>
                          <span className={clsx('font-mono text-[13px] font-bold', OPT_TEXT[i])}>{opt.pool} TKN</span>
                          <span className="text-[10px] text-muted font-bold truncate max-w-[100px]">{opt.label} — {Math.round((opt.pool / selectedTotal) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Einsätze-Liste (flex-1, fuellt verbleibenden Raum) */}
                <div className="p-4 border-b border-border flex-1 min-h-0 flex flex-col">
                  <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2 shrink-0">Einsätze</div>
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    {(() => {
                      const { visible, hidden, total } = visibleBetsFor(selectedMarket.id);
                      if (total === 0) return <div className="text-[12px] text-muted text-center py-3">Noch keine weiteren Einsätze.</div>;
                      return (
                        <>
                          {visible.map(b => {
                            const p = players.find(pl => pl.id === b.playerId);
                            const optIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                            const isMine = b.playerId === me.id;
                            return (
                              <div key={b.id} className={clsx('flex items-center gap-2 py-2 border-b border-border/60 last:border-0',
                                isMine && 'bg-yellow/5 -mx-2 px-2 rounded-md')}>
                                <div className="w-8 h-8 rounded-md bg-white/5 overflow-hidden shrink-0">
                                  {p && <CharacterAvatar player={p} size="sm" className="w-full h-full" />}
                                </div>
                                <span className="flex-1 text-[12px] font-bold text-white truncate">
                                  {p?.name ?? '?'}{isMine && ' (du)'}
                                </span>
                                <span className={clsx('text-[10px] font-black px-1.5 py-0.5 rounded-md border', OPT_BG[optIdx], OPT_TEXT[optIdx], OPT_BORDER[optIdx])}>
                                  {b.optionLabel}
                                </span>
                                <span className="font-mono text-[11px] text-muted">{b.amount}</span>
                              </div>
                            );
                          })}
                          {hidden > 0 && (
                            <div className="text-[12px] text-muted text-center py-2 flex items-center justify-center gap-1.5">
                              🙈 {hidden} {hidden === 1 ? 'weiterer Tipp ist' : 'weitere Tipps sind'} ausgeblendet
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Tipp-gespeichert-Box (fix unten — wie die Wett-Buttons im offenen Fall) */}
                <div className="p-4 pb-5 shrink-0">
                  <div className="bg-yellow/10 border border-yellow/25 rounded-2xl p-4 text-center">
                    <div className="text-[24px] mb-1">🔒</div>
                    <div className="text-[14px] font-black text-yellow">Tipp gespeichert!</div>
                    <div className="text-[12px] text-muted mt-1">
                      <b className="text-white">{selectedMyBet.amount} TKN</b> auf{' '}
                      <b className="text-yellow">„{selectedMyBet.optionLabel}"</b>
                    </div>
                    {selectedMarket.status === 'open' && (selectedMarket.kickoffAt ?? Infinity) > now && (
                      <>
                        {(selectedMarket.minBet ?? 0) > selectedMyBet.amount && (
                          <div className="mt-2 text-[11px] font-bold text-yellow bg-yellow/10 border border-yellow/30 rounded-lg px-2.5 py-1.5 leading-snug">
                            ⚠️ Mindesteinsatz wurde auf {selectedMarket.minBet} TKN erhöht — dein Tipp liegt darunter. Tippe „Wette ändern" und passe den Einsatz an.
                          </div>
                        )}
                        <div className="text-[10px] text-muted/70 mt-1.5">Änderbar bis ~10 Min. vor Anpfiff.</div>
                        <button
                          onClick={() => { setIsChangingBet(true); setBetAmount(Math.max(selectedMyBet.amount, selectedMarket.minBet ?? 1)); }}
                          className="mt-3 text-[11px] font-black text-yellow border border-yellow/30 bg-yellow/10 rounded-lg px-3 py-1.5 hover:bg-yellow/20 transition-colors cursor-pointer">
                          ✏️ Wette ändern
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Wettannahme geschlossen (Anpfiff erreicht, Server-Lock folgt) ── */}
            {selectedMarket && !selectedMyBet && selectedMarket.status === 'open' && selectedMarket.kickoffAt && now >= selectedMarket.kickoffAt && (
              <div className="p-4 pb-8">
                <div className="bg-yellow/10 border border-yellow/25 rounded-2xl p-4 text-center">
                  <div className="text-[24px] mb-1">🔒</div>
                  <div className="text-[14px] font-black text-yellow">Wettannahme geschlossen</div>
                  <div className="text-[12px] text-muted mt-1">Das Spiel hat bereits angepfiffen.</div>
                </div>
              </div>
            )}

            {/* ── Bet form (auch im Aenderungs-Modus, dann mit changeBet statt placeBet) ── */}
            {selectedMarket && (!selectedMyBet || isChangingBet) && selectedMarket.status === 'open' && (selectedMarket.kickoffAt ?? Infinity) > now && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {isChangingBet && (
                  <div className="px-5 pt-3 text-[11px] font-black text-yellow text-center shrink-0">
                    ✏️ Wette wird geändert — wähle eine neue Option oder einen anderen Einsatz
                  </div>
                )}
                {isKnockoutMarket(selectedMarket) && (
                  <div className="px-4 pt-3 shrink-0"><KnockoutHint /></div>
                )}

                {/* Pool: TKN + % (analog Wetten-Tab) */}
                {selectedTotal > 0 && (
                  <div className="p-4 pt-3 border-b border-border shrink-0">
                    <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Pool-Verteilung</div>
                    <div className="h-3 rounded-full overflow-hidden flex mb-2.5">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className="h-full transition-all duration-500"
                          style={{ width: `${(opt.pool / selectedTotal) * 100}%`, backgroundColor: OPT_HEX[i] }} />
                      ))}
                    </div>
                    <div className="flex justify-between gap-3">
                      {selectedMarket.options.map((opt, i) => (
                        <div key={opt.id} className={clsx('flex flex-col gap-0.5 min-w-0',
                          i === 0 ? 'items-start' : i === selectedMarket.options.length - 1 ? 'items-end' : 'items-center')}>
                          <span className={clsx('font-mono text-[13px] font-bold', OPT_TEXT[i])}>{opt.pool} TKN</span>
                          <span className="text-[10px] text-muted font-bold truncate max-w-[100px]">{opt.label} — {Math.round((opt.pool / selectedTotal) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Einsätze-Liste (flex-1, fuellt verbleibenden Raum) */}
                <div className="p-4 border-b border-border flex-1 min-h-0 flex flex-col">
                  <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2 shrink-0">Einsätze</div>
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    {(() => {
                      const { visible, hidden, total } = visibleBetsFor(selectedMarket.id);
                      if (total === 0) return <div className="text-[12px] text-muted text-center py-3">Noch keine Einsätze — sei der/die Erste!</div>;
                      return (
                        <>
                          {visible.map(b => {
                            const p = players.find(pl => pl.id === b.playerId);
                            const optIdx = selectedMarket.options.findIndex(o => o.id === b.optionId);
                            const isMine = b.playerId === me.id;
                            return (
                              <div key={b.id} className={clsx('flex items-center gap-2 py-2 border-b border-border/60 last:border-0',
                                isMine && 'bg-yellow/5 -mx-2 px-2 rounded-md')}>
                                <div className="w-8 h-8 rounded-md bg-white/5 overflow-hidden shrink-0">
                                  {p && <CharacterAvatar player={p} size="sm" className="w-full h-full" />}
                                </div>
                                <span className="flex-1 text-[12px] font-bold text-white truncate">{p?.name ?? '?'}{isMine && ' (du)'}</span>
                                <span className={clsx('text-[10px] font-black px-1.5 py-0.5 rounded-md border', OPT_BG[optIdx], OPT_TEXT[optIdx], OPT_BORDER[optIdx])}>
                                  {b.optionLabel}
                                </span>
                                <span className="font-mono text-[11px] text-muted">{b.amount}</span>
                              </div>
                            );
                          })}
                          {hidden > 0 && (
                            <div className="text-[12px] text-muted text-center py-2 flex items-center justify-center gap-1.5">
                              🙈 {hidden} {hidden === 1 ? 'weiterer Tipp ist' : 'weitere Tipps sind'} ausgeblendet
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Slider (fix) */}
                <div className="p-4 border-b border-border shrink-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-black text-muted uppercase tracking-[0.1em]">Dein Einsatz</span>
                    <span className="font-mono text-[18px] font-bold text-yellow">{betAmount} <span className="text-[13px] text-muted">TKN</span></span>
                  </div>
                  {(() => {
                    // Budget = freie Token + (beim Ändern) bisheriger Einsatz. Max hart
                    // aufs Budget gedeckelt; Min nie über Max (sonst eingefrorener Regler).
                    const cap = selectedMarket.maxBet && selectedMarket.maxBet > 0
                      ? Math.min(selectedMarket.maxBet, changeBudget)
                      : Math.min(500, changeBudget);
                    const sMin = Math.min(selectedMarket.minBet ?? 10, cap);
                    const sVal = Math.min(Math.max(betAmount, sMin), cap);
                    return (
                      <input
                        type="range"
                        min={sMin}
                        max={cap}
                        value={sVal}
                        onChange={e => setBetAmount(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-input rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg"
                      />
                    );
                  })()}
                  <div className="flex justify-between text-[10px] text-muted/60 mt-1">
                    <span>Min {selectedMarket.minBet ?? 10}</span>
                    <span>Verfügbar: {changeBudget} TKN</span>
                  </div>
                </div>

                {/* Bet buttons (fix unten — immer sichtbar) */}
                <div className="p-4 pb-5 grid grid-cols-3 gap-2 shrink-0">
                  {selectedMarket.options.map((opt, i) => {
                    // Zentrale Vorschau-Mathe (utils/credits) — identisch mit dem
                    // Wetten-Tab und der Server-Auszahlung. Beim Ändern wird die
                    // bestehende Wette aus den Pools herausgerechnet.
                    const payout = calcMarketPayoutPreview(
                      selectedMarket, opt.id, betAmount,
                      isChangingBet && selectedMyBet
                        ? { optionId: selectedMyBet.optionId, amount: selectedMyBet.amount }
                        : undefined,
                    );
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleBet(selectedMarket.id, opt.id, opt.label)}
                        disabled={changeBudget < betAmount}
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
              <span className="text-[12px] text-muted block mt-2">
                Änderbar bis ~10 Min. vor Anpfiff.
              </span>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setConfirmBet(null)}
                disabled={betPending}
                className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Abbrechen
              </button>
              <button
                onClick={executeBet}
                disabled={betPending}
                className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_4px_20px_rgba(255,212,71,0.35)] hover:shadow-[0_6px_28px_rgba(255,212,71,0.45)] transition-all disabled:opacity-60 disabled:cursor-wait"
              >
                {betPending ? '…' : '⚽ Tippen!'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// K.-o.-Phase: alles ab Sechzehntelfinale. Diese Spiele können in Verlängerung/
// Elfern gehen — wir lösen aber nach Wettbüro-Standard nach dem 90-Min-Stand auf.
const KO_PHASES = new Set([
  'sechzehntelfinale', 'achtelfinale', 'viertelfinale', 'halbfinale', 'platz3', 'finale',
]);

function isKnockoutMarket(m: Market): boolean {
  return m.marketSubtype === 'wm-match' && KO_PHASES.has(String((m as any).phase ?? ''));
}

function KnockoutHint() {
  return (
    <div className="bg-yellow/8 border border-yellow/30 rounded-xl p-3 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-[16px] leading-none">⚠️</span>
        <div className="text-[11px] text-yellow/90 leading-relaxed">
          <b>K.-o.-Spiel:</b> Diese Wette gilt für den Endstand nach{' '}
          <b>90 Min + Nachspielzeit</b>. Verlängerung und Elfmeterschießen zählen{' '}
          <b>nicht</b> — bei 1:1 nach 90 Min gewinnt der Tipp auf{' '}
          <b>„Unentschieden"</b>, unabhängig davon, wer das Spiel später gewinnt.
        </div>
      </div>
    </div>
  );
}
