import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { auth } from '../firebase';

// Admin-Werkzeug: eine FEHLERHAFTE Auflösung eines Standard-Marktes korrigieren
// (z. B. falsche Gewinner-Option durch fehlerhafte Daten-API). Läuft über die
// Netlify-Function `correct-resolution` — IMMER zuerst als Probelauf (dry-run),
// dann auf Bestätigung anwenden.

interface ReportRow {
  playerId: string; name: string; oldPayout: number; newPayout: number;
  milestoneDelta: number; tokenDelta: number; netGainDelta: number;
  oldStreak: number | null; newStreak: number;
}
interface Report {
  ok: boolean; dryRun: boolean; question: string;
  oldWinningLabel: string; newWinningLabel: string; newResType: string;
  jackpotDelta: number; totalTokenDelta: number; affectedPlayers: number;
  rows: ReportRow[]; scoreSet?: { home: number; away: number } | null; note?: string; error?: string;
}

export default function ResolutionCorrection() {
  const markets = useStore(s => s.markets);
  const [marketId, setMarketId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [penA, setPenA] = useState('');
  const [penB, setPenB] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState('');

  // Nur fehlerhaft korrigierbare Märkte: aufgelöste Standard-Märkte (kein
  // Jackpot/Combo/offene Frage/Multi-Winner).
  const fixable = useMemo(() => markets.filter(m =>
    m.status === 'resolved'
    && m.type !== 'combo'
    && m.marketSubtype !== 'jackpot'
    && !m.isOpenQuestion
    && !m.multiSelect
    && !(Array.isArray((m as any).winningOptionIds) && (m as any).winningOptionIds.length > 1)
    && !!m.winningOptionId
  ).sort((a, b) => (b.kickoffAt ?? 0) - (a.kickoffAt ?? 0)), [markets]);

  const market = fixable.find(m => m.id === marketId);
  const labelOf = (id?: string | null) => market?.options.find(o => o.id === id)?.label ?? (id ?? '—');
  const isWm = market?.marketSubtype === 'wm-match';

  const scoreBody = () => {
    const h = parseInt(scoreA); const a = parseInt(scoreB);
    return Number.isFinite(h) && Number.isFinite(a) && h >= 0 && a >= 0 ? { home: h, away: a } : undefined;
  };
  const penaltyBody = () => {
    const h = parseInt(penA); const a = parseInt(penB);
    return Number.isFinite(h) && Number.isFinite(a) && h >= 0 && a >= 0 ? { home: h, away: a } : undefined;
  };

  const run = async (apply: boolean) => {
    if (!marketId || !optionId) { setErr('Bitte Markt und richtige Option wählen.'); return; }
    if (isWm && !scoreBody()) { setErr('Bitte das korrekte Ergebnis (z. B. 1 : 1) eingeben — sonst stimmt die Spielplan-Tabelle nicht.'); return; }
    const pen = penaltyBody();
    if ((penA !== '' || penB !== '') && !pen) { setErr('i. E.: bitte beide Werte (≥ 0) eingeben oder beide leer lassen.'); return; }
    if (pen && pen.home === pen.away) { setErr('Ein Elfmeterschießen endet nie unentschieden — bitte korrekte i.E.-Bilanz eingeben.'); return; }
    if (apply && !window.confirm(
      `Korrektur WIRKLICH anwenden?\n\n„${market?.question}"\n${labelOf(market?.winningOptionId)} → ${labelOf(optionId)}`
      + (isWm && scoreBody() ? `\nErgebnis: ${scoreBody()!.home}:${scoreBody()!.away}` : '')
      + (pen ? `\ni. E.: ${pen.home}:${pen.away}` : '')
      + `\n\nTokens, Tagesbilanz, Jackpot, Streaks${isWm ? ' und Spielplan-Tabelle/Feed' : ''} werden angepasst.`,
    )) return;
    setBusy(true); setErr(''); if (apply) setReport(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt.');
      const res = await fetch('/.netlify/functions/correct-resolution', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId, winningOptionId: optionId, apply, score: scoreBody(), penalties: penaltyBody() }),
      });
      const data: Report = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Fehler.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-orange/30 rounded-2xl p-4 mb-2.5">
      <div className="text-[11px] font-black text-orange tracking-[0.15em] uppercase mb-2">🛠️ Auflösung korrigieren</div>
      <div className="text-[10px] text-muted leading-relaxed mb-3">
        Bucht eine <b className="text-white">falsche Auflösung</b> sauber um: alte Auszahlung zurück,
        richtige Option auszahlen — inkl. Tagesbilanz, Jackpot, Streak-Boni und neu berechneter
        Streak-Zähler. Nur Standard-Märkte. <b className="text-orange">Immer zuerst Probelauf!</b>
      </div>

      <select value={marketId} onChange={e => {
          const id = e.target.value;
          const m = fixable.find(x => x.id === id);
          // Option standardmäßig auf den AKTUELLEN Gewinner setzen → Buttons sind
          // sofort aktiv (z. B. wenn nur das Elfer-Ergebnis korrigiert werden soll).
          // Für eine echte Gewinner-Korrektur einfach eine andere Option wählen.
          setMarketId(id); setOptionId(m?.winningOptionId ?? ''); setReport(null); setErr('');
          const fs = (m as any)?.finalScore;
          setScoreA(fs && typeof fs.home === 'number' ? String(fs.home) : '');
          setScoreB(fs && typeof fs.away === 'number' ? String(fs.away) : '');
          // i.E. nur vorbefüllen, wenn eine gültige (entschiedene) Bilanz gespeichert ist.
          const validPen = fs && typeof fs.penaltiesHome === 'number' && typeof fs.penaltiesAway === 'number' && fs.penaltiesHome !== fs.penaltiesAway;
          setPenA(validPen ? String(fs.penaltiesHome) : '');
          setPenB(validPen ? String(fs.penaltiesAway) : '');
        }}
        className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-[12px] font-bold text-white outline-none focus:border-orange/50 mb-2">
        <option value="">— Aufgelösten Markt wählen —</option>
        {fixable.map(m => (
          <option key={m.id} value={m.id}>
            {m.question} · aktuell: {m.options.find(o => o.id === m.winningOptionId)?.label ?? m.winningOptionId}
          </option>
        ))}
      </select>

      {market && (
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="text-[10px] font-black text-muted uppercase tracking-wider">Richtiges Ergebnis</div>
          <div className="flex flex-wrap gap-1.5">
            {market.options.map(o => {
              const isCurrent = o.id === market.winningOptionId;
              const sel = o.id === optionId;
              return (
                <button key={o.id}
                  onClick={() => setOptionId(o.id)}
                  className={clsx('text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition-colors',
                    sel ? 'border-orange/60 bg-orange/15 text-orange'
                      : isCurrent ? 'border-white/10 bg-white/5 text-muted'
                        : 'border-white/15 bg-white/5 text-white hover:border-orange/40')}>
                  {o.label}{isCurrent ? ' (aktuell)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {market && isWm && (
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="text-[10px] font-black text-muted uppercase tracking-wider">
            Korrektes Ergebnis (für die Spielplan-Tabelle)
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-bold text-white truncate text-right">{market.teamA ?? 'Heim'}</span>
            <input type="number" min={0} value={scoreA} onChange={e => setScoreA(e.target.value)}
              className="w-12 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] font-black text-white text-center outline-none focus:border-orange/50" />
            <span className="text-muted font-black">:</span>
            <input type="number" min={0} value={scoreB} onChange={e => setScoreB(e.target.value)}
              className="w-12 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] font-black text-white text-center outline-none focus:border-orange/50" />
            <span className="flex-1 text-[11px] font-bold text-white truncate">{market.teamB ?? 'Gast'}</span>
          </div>
          {/* Optional: Elfmeterschießen-Ergebnis (korrigiert die Feed-Zeile) */}
          <div className="text-[10px] font-black text-muted uppercase tracking-wider mt-1">
            Elfmeterschießen i. E. (optional)
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-bold text-white truncate text-right">{market.teamA ?? 'Heim'}</span>
            <input type="number" min={0} value={penA} onChange={e => setPenA(e.target.value)}
              className="w-12 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] font-black text-white text-center outline-none focus:border-orange/50" />
            <span className="text-muted font-black">:</span>
            <input type="number" min={0} value={penB} onChange={e => setPenB(e.target.value)}
              className="w-12 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] font-black text-white text-center outline-none focus:border-orange/50" />
            <span className="flex-1 text-[11px] font-bold text-white truncate">{market.teamB ?? 'Gast'}</span>
          </div>
          <div className="text-[9px] text-muted">Leer lassen, wenn kein Elferschießen. Endet nie unentschieden.</div>
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button onClick={() => run(false)} disabled={busy || !marketId || !optionId}
          className="flex-1 p-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-[11px] font-black hover:border-white/30 transition-colors disabled:opacity-40">
          {busy ? '…' : '🔍 Probelauf'}
        </button>
        <button onClick={() => run(true)} disabled={busy || !report || report.dryRun === false}
          className="flex-1 p-2.5 rounded-xl bg-orange/15 border border-orange/40 text-orange text-[11px] font-black hover:bg-orange/25 transition-colors disabled:opacity-40">
          {busy ? '…' : '✅ Korrektur anwenden'}
        </button>
      </div>
      {report && !report.dryRun && (
        <div className="mt-1 text-[9px] text-muted">Schon angewandt — für eine weitere Korrektur neuen Probelauf starten.</div>
      )}

      {err && <div className="mt-2 text-[11px] font-bold text-red bg-red/10 border border-red/30 rounded-lg px-2.5 py-2">{err}</div>}

      {report && (
        <div className="mt-3 bg-input border border-border rounded-xl p-3">
          <div className={clsx('text-[11px] font-black mb-1', report.dryRun ? 'text-yellow' : 'text-green')}>
            {report.dryRun ? '🔍 Probelauf (nichts geschrieben)' : '✅ Korrektur angewandt'}
          </div>
          <div className="text-[11px] text-white font-bold mb-0.5">{report.question}</div>
          <div className="text-[10px] text-muted mb-2">
            {report.oldWinningLabel} → <b className="text-white">{report.newWinningLabel}</b> ·
            {report.scoreSet ? <> Ergebnis: <b className="text-white">{report.scoreSet.home}:{report.scoreSet.away}</b> · </> : null}
            Spieler: {report.affectedPlayers} ·
            Token-Summe: <b className={report.totalTokenDelta >= 0 ? 'text-green' : 'text-red'}>{report.totalTokenDelta >= 0 ? '+' : ''}{report.totalTokenDelta}</b> ·
            Jackpot: <b className="text-yellow">{report.jackpotDelta >= 0 ? '+' : ''}{report.jackpotDelta}</b>
          </div>
          <div className="max-h-[260px] overflow-y-auto no-scrollbar">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-muted text-left">
                  <th className="py-1 pr-2 font-black">Spieler</th>
                  <th className="py-1 px-1 font-black text-right">alt→neu</th>
                  <th className="py-1 px-1 font-black text-right">Δ Token</th>
                  <th className="py-1 pl-1 font-black text-right">Streak</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map(r => (
                  <tr key={r.playerId} className="border-t border-border/50">
                    <td className="py-1 pr-2 text-white font-bold truncate max-w-[110px]">{r.name}</td>
                    <td className="py-1 px-1 text-muted text-right whitespace-nowrap">{r.oldPayout}→{r.newPayout}</td>
                    <td className={clsx('py-1 px-1 text-right font-bold whitespace-nowrap', r.tokenDelta > 0 ? 'text-green' : r.tokenDelta < 0 ? 'text-red' : 'text-muted')}>
                      {r.tokenDelta >= 0 ? '+' : ''}{r.tokenDelta}{r.milestoneDelta ? ` (M${r.milestoneDelta >= 0 ? '+' : ''}${r.milestoneDelta})` : ''}
                    </td>
                    <td className="py-1 pl-1 text-right text-muted whitespace-nowrap">{r.oldStreak ?? '?'}→{r.newStreak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
