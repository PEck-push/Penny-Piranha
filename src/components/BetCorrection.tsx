import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';

// Admin-Werkzeug: einen bestehenden Einsatz/Tipp nachträglich korrigieren
// (Option und/oder Betrag). Läuft über die admin-correct-bet-Function; wirkt auf
// offene UND gesperrte (noch nicht aufgelöste) Märkte. Pools & Tokens werden
// serverseitig sauber umgebucht.

export default function BetCorrection() {
  const markets = useStore(s => s.markets);
  const bets = useStore(s => s.bets);
  const players = useStore(s => s.players);
  const adminCorrectBet = useStore(s => s.adminCorrectBet);

  const [marketId, setMarketId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Nur nicht-aufgelöste Märkte, die überhaupt Tipps haben.
  const betCountByMarket = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bets) map.set(b.marketId, (map.get(b.marketId) ?? 0) + 1);
    return map;
  }, [bets]);
  const fixable = useMemo(() => markets
    .filter(m => (m.status === 'open' || m.status === 'locked') && (betCountByMarket.get(m.id) ?? 0) > 0)
    .sort((a, b) => (b.kickoffAt ?? 0) - (a.kickoffAt ?? 0)), [markets, betCountByMarket]);

  const market = fixable.find(m => m.id === marketId);
  const marketBets = useMemo(() => bets.filter(b => b.marketId === marketId), [bets, marketId]);
  const currentBet = marketBets.find(b => b.playerId === playerId);
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name ?? pid;

  const selectPlayer = (pid: string) => {
    setPlayerId(pid);
    const b = marketBets.find(x => x.playerId === pid);
    setOptionId(b?.optionId ?? '');
    setAmount(b ? String(b.amount ?? 0) : '');
    setMsg(null);
  };

  const run = async () => {
    if (!market || !currentBet || !optionId) { setMsg({ ok: false, text: 'Bitte Markt, Spieler und Option wählen.' }); return; }
    const amt = Math.max(0, Math.floor(Number(amount)));
    if (!Number.isFinite(amt)) { setMsg({ ok: false, text: 'Ungültiger Betrag.' }); return; }
    const opt = market.options.find(o => o.id === optionId);
    if (!window.confirm(
      `Einsatz korrigieren?\n\n${nameOf(playerId)} · ${market.question}\n`
      + `${currentBet.optionLabel} / ${currentBet.amount} → ${opt?.label} / ${amt} TKN\n\n`
      + `Pools und Tokens werden umgebucht.`,
    )) return;
    setBusy(true); setMsg(null);
    const res = await adminCorrectBet(marketId, playerId, optionId, opt?.label ?? optionId, amt);
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `✓ Einsatz von „${nameOf(playerId)}" korrigiert: ${opt?.label} / ${amt} TKN.` });
    } else {
      setMsg({ ok: false, text: res.error ?? 'Fehler.' });
    }
  };

  const noStake = !!(market?.noStake || market?.marketSubtype === 'jackpot');

  return (
    <div className="bg-card border border-blue2/25 rounded-2xl p-4 mb-2.5">
      <div className="text-[11px] font-black text-blue2 tracking-[0.15em] uppercase mb-2">🎯 Einsatz korrigieren</div>
      <div className="text-[10px] text-muted mb-3 leading-relaxed">
        Ändert Option und/oder Betrag eines bestehenden Tipps — auch auf
        <b className="text-white"> gesperrten</b> Märkten. Pools &amp; Tokens werden
        serverseitig umgebucht. Aufgelöste Märkte gehen über die Auflösungs-Korrektur.
      </div>

      {msg && (
        <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold mb-3',
          msg.ok ? 'bg-green/10 border border-green/30 text-green' : 'bg-red/10 border border-red/30 text-red')}>
          {msg.text}
        </div>
      )}

      {/* Markt */}
      <select value={marketId} onChange={e => { setMarketId(e.target.value); setPlayerId(''); setOptionId(''); setAmount(''); setMsg(null); }}
        className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-[12px] font-bold text-white outline-none focus:border-blue2/50 mb-2">
        <option value="">— Markt wählen (offen/gesperrt mit Tipps) —</option>
        {fixable.map(m => (
          <option key={m.id} value={m.id}>
            {m.status === 'locked' ? '🔒 ' : ''}{m.question} · {betCountByMarket.get(m.id)} Tipps
          </option>
        ))}
      </select>

      {/* Spieler */}
      {market && (
        <select value={playerId} onChange={e => selectPlayer(e.target.value)}
          className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-[12px] font-bold text-white outline-none focus:border-blue2/50 mb-2">
          <option value="">— Spieler wählen —</option>
          {[...marketBets]
            .sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)))
            .map(b => (
              <option key={b.playerId} value={b.playerId}>
                {nameOf(b.playerId)} · aktuell: {b.optionLabel}{noStake ? '' : ` / ${b.amount} TKN`}
              </option>
            ))}
        </select>
      )}

      {/* Neue Option + Betrag */}
      {market && currentBet && (
        <>
          <div className="text-[10px] font-black text-muted uppercase tracking-wider mb-1.5">Neue Option</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {market.options.map(o => (
              <button key={o.id} onClick={() => setOptionId(o.id)}
                className={clsx('text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition-colors',
                  o.id === optionId ? 'border-blue2/60 bg-blue/15 text-blue2' : 'border-white/15 bg-white/5 text-white hover:border-blue2/40')}>
                {o.label}
              </button>
            ))}
          </div>
          {!noStake && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-muted uppercase tracking-wider">Einsatz</span>
              <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
                className="w-24 bg-input border border-border rounded-lg px-2.5 py-1.5 text-[13px] font-black text-white text-center outline-none focus:border-blue2/50" />
              <span className="text-[11px] text-muted">TKN</span>
            </div>
          )}
          <button onClick={run} disabled={busy || !optionId}
            className="w-full p-2.5 rounded-xl bg-gradient-to-br from-blue to-purple text-white text-[12px] font-black transition-all hover:-translate-y-px disabled:opacity-40">
            {busy ? '…' : '🎯 Einsatz korrigieren'}
          </button>
        </>
      )}
    </div>
  );
}
