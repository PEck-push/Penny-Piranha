import { useState, useMemo } from 'react';
import { useStore, type Market, type Bet, type Player } from '../store';

// Admin-only Audit-Komponente: Liste der zuletzt aufgelösten Märkte.
// Jeder Eintrag zeigt das Endergebnis (falls vom auto-resolve mit API-Score
// aufgelöst) und beim Aufklappen eine Tabelle mit Spieler / Tipp / Einsatz /
// Auszahlung. Quelle = bets-Collection (payout-Feld), kein extra Backend-Call.
export default function ResolvedMarketsInspector() {
  const markets = useStore(s => s.markets);
  const bets = useStore(s => s.bets);
  const players = useStore(s => s.players);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  const resolved = useMemo(
    () => markets
      .filter(m => m.status === 'resolved' || m.status === 'cancelled')
      .sort((a, b) => resolvedMs(b) - resolvedMs(a))
      .slice(0, limit),
    [markets, limit],
  );

  if (resolved.length === 0) {
    return <div className="text-[12px] text-muted text-center py-2">Noch keine aufgelösten Märkte.</div>;
  }

  const totalResolved = markets.filter(m => m.status === 'resolved' || m.status === 'cancelled').length;

  return (
    <>
      {resolved.map(m => (
        <InspectorRow
          key={m.id}
          market={m}
          bets={bets.filter(b => b.marketId === m.id)}
          players={players}
          open={expanded === m.id}
          onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
        />
      ))}
      {limit < totalResolved && (
        <button
          onClick={() => setLimit(l => l + 20)}
          className="w-full text-[11px] font-bold text-muted hover:text-white bg-white/3 border border-white/10 rounded-lg py-2 mt-2 cursor-pointer"
        >
          Weitere {Math.min(20, totalResolved - limit)} laden ({totalResolved - limit} verbleibend)
        </button>
      )}
    </>
  );
}

function InspectorRow({
  market, bets, players, open, onToggle,
}: { market: Market; bets: Bet[]; players: Player[]; open: boolean; onToggle: () => void }) {
  const winLabel = market.options?.find(o => o.id === market.winningOptionId)?.label ?? '—';
  const totalIn = bets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalOut = bets.reduce((s, b) => s + (b.payout ?? 0), 0);
  const winners = bets.filter(b => (b.payout ?? 0) > 0).length;
  const headline = formatHeadline(market);
  const dateLabel = formatDate(resolvedMs(market));

  return (
    <div className="bg-input rounded-xl mb-2 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-3 cursor-pointer bg-transparent border-0 font-sans"
      >
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-black text-muted shrink-0 mt-0.5">{open ? '▼' : '▶'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-white truncate">{market.question}</div>
            {headline && headline !== market.question && (
              <div className="text-[11px] text-yellow font-mono mt-0.5">{headline}</div>
            )}
            <div className="text-[10px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>→ <b className="text-green">{winLabel}</b></span>
              <span>{bets.length} Wetten · {winners} ✓</span>
              <span>{totalIn} → {totalOut} TKN</span>
              {market.status === 'cancelled' && <span className="text-red">storniert</span>}
              {market.resolutionType === 'rollover' && <span className="text-yellow">rollover</span>}
              {market.resolutionType === 'no-winner' && <span className="text-muted">kein Gewinner</span>}
              {market.resolutionType === 'all-same-side' && <span className="text-muted">alle gleiche Seite</span>}
              {market.resolvedBy === 'auto' && <span className="text-blue2">auto</span>}
              {market.resolvedBy === 'admin' && <span className="text-purple2">admin</span>}
              {dateLabel && <span>· {dateLabel}</span>}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-white/8 pt-2">
          {bets.length === 0 ? (
            <div className="text-[11px] text-muted py-2">Keine Wetten auf diesem Markt.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] font-black text-muted uppercase tracking-wider">
                    <th className="text-left pb-1.5">Spieler</th>
                    <th className="text-left pb-1.5">Tipp</th>
                    <th className="text-right pb-1.5">Einsatz</th>
                    <th className="text-right pb-1.5">Auszahlung</th>
                    <th className="text-right pb-1.5">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bets]
                    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0))
                    .map(b => {
                      const player = players.find(p => p.id === b.playerId);
                      const name = player?.name || `(${b.playerId.slice(0, 6)})`;
                      const optLabel = market.options?.find(o => o.id === b.optionId)?.label ?? b.optionLabel ?? b.optionId;
                      const correct = b.optionId === market.winningOptionId;
                      const payout = b.payout ?? 0;
                      const delta = payout - (b.amount || 0);
                      return (
                        <tr key={b.id} className="border-t border-white/5">
                          <td className="py-1.5 text-white truncate max-w-[110px]">{name}</td>
                          <td className="py-1.5">
                            <span className={correct ? 'text-green' : 'text-muted'}>
                              {correct ? '✓ ' : '✗ '}{optLabel}
                            </span>
                          </td>
                          <td className="py-1.5 text-right font-mono text-muted">{b.amount}</td>
                          <td className="py-1.5 text-right font-mono text-white">{payout}</td>
                          <td className={'py-1.5 text-right font-mono ' + (delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-muted')}>
                            {delta > 0 ? '+' : ''}{delta}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatHeadline(m: Market): string | null {
  const s = m.finalScore;
  if (!s) return null;
  const a = m.teamA ?? '';
  const b = m.teamB ?? '';
  const base = `${a} ${s.home}:${s.away} ${b}`.trim();
  if (s.duration === 'PENALTY_SHOOTOUT' && s.penaltiesHome != null && s.penaltiesAway != null) {
    return `${base} (i. E. ${s.penaltiesHome}:${s.penaltiesAway})`;
  }
  if (s.duration === 'EXTRA_TIME') return `${base} (n. V.)`;
  return base;
}

function resolvedMs(m: Market): number {
  const r: any = m.resolvedAt;
  if (!r) return 0;
  if (typeof r === 'number') return r;
  if (typeof r.toMillis === 'function') return r.toMillis();
  if (typeof r.seconds === 'number') return r.seconds * 1000;
  return 0;
}

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}
