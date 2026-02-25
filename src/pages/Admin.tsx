import { useState } from 'react';
import { useStore, INITIAL_PLAYERS, INITIAL_MARKETS, MarketOption } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { resetToInitialState } from '../services/db';

export default function Admin() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [newMarketQuestion, setNewMarketQuestion] = useState('');
  const [newMarketType, setNewMarketType] = useState<'standard' | 'hot-take' | 'anonymous' | 'combo'>('standard');
  // NEU: Binär-Toggle + Custom-Options
  const [isBinary, setIsBinary] = useState(true);
  const [customOptions, setCustomOptions] = useState<string[]>(['', '']);
  const [givePlayerId, setGivePlayerId] = useState('');
  const [giveAmount, setGiveAmount] = useState('20');

  const markets = useStore(s => s.markets);
  const jackpot = useStore(s => s.jackpot);
  const createMarket = useStore(s => s.createMarket);
  const resolveMarket = useStore(s => s.resolveMarket);
  const resolveRollover = useStore(s => s.resolveRollover);
  const resolveStorno = useStore(s => s.resolveStorno);
  const lockMarket = useStore(s => s.lockMarket);
  const giveTokens = useStore(s => s.giveTokens);
  const resetState = useStore(s => s.resetState);
  const players = useStore(s => s.players);
  const navigate = useNavigate();

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const p = pin + num;
      setPin(p);
      if (p === '1234') { setTimeout(() => setUnlocked(true), 300); }
      else if (p.length === 4) { setTimeout(() => setPin(''), 500); }
    }
  };

  // Options aufbauen (binär oder custom)
  const buildOptions = (): MarketOption[] => {
    if (isBinary) return [
      { id: 'yes', label: 'JA', pool: 0 },
      { id: 'no',  label: 'NEIN', pool: 0 },
    ];
    return customOptions
      .filter(o => o.trim() !== '')
      .map(label => ({ id: Math.random().toString(36).substring(7), label: label.trim(), pool: 0 }));
  };

  const validOptions = isBinary || customOptions.filter(o => o.trim() !== '').length >= 2;
  const canCreate = newMarketQuestion.trim() !== '' && validOptions;

  const handleCreateMarket = () => {
    if (!canCreate) return;
    createMarket({
      question: newMarketQuestion,
      type: newMarketType,
      status: 'open',
      createdBy: 'admin',
      options: buildOptions(),
      winningOptionId: null,
      resolutionType: null,
      ...(newMarketType === 'hot-take' ? { expiresAt: Date.now() + 60000 } : {}),
    });
    setNewMarketQuestion('');
    setCustomOptions(['', '']);
    setIsBinary(true);
  };

  const handleGiveTokens = () => {
    const player = players.find(p => p.name.toLowerCase() === givePlayerId.toLowerCase() || p.id === givePlayerId);
    if (player && giveAmount) { giveTokens(player.id, parseInt(giveAmount)); setGivePlayerId(''); }
  };

  if (!unlocked) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        <div className="absolute inset-0 z-[100] bg-[#02040C]/95 backdrop-blur-2xl flex flex-col items-center justify-center">
          <button onClick={() => navigate('/dashboard')} className="absolute top-6 left-6 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors">✕</button>
          <div className="text-[70px] mb-3 animate-[float_3s_ease-in-out_infinite]">🐼</div>
          <div className="text-[18px] font-black text-white mb-1">Admin-Zugang</div>
          <div className="text-[12px] text-muted mb-7">Nur für den Host · PIN eingeben (1234)</div>
          <div className="flex gap-3 mb-8">
            {[0,1,2,3].map(i => (
              <div key={i} className={clsx("w-3.5 h-3.5 rounded-full border-2 transition-all duration-200", i < pin.length ? "bg-blue2 border-blue2 shadow-[0_0_12px_rgba(93,143,255,0.6)]" : "border-white/10 bg-transparent")} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 w-[230px]">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <div key={n} onClick={() => handlePinInput(n.toString())} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90">{n}</div>
            ))}
            <div onClick={() => setPin(pin.slice(0,-1))} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[16px] text-muted flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90">⌫</div>
            <div onClick={() => handlePinInput('0')} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90">0</div>
            <div onClick={() => navigate('/dashboard')} className="aspect-square rounded-2xl bg-green/10 border border-green/40 text-green font-mono text-[22px] font-bold flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90">✕</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,61,90,.12)_0%,transparent_40%)]" />
      <div className="relative z-10 flex flex-col flex-1">
        <div className="p-3.5 px-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="text-[17px] font-black text-white">🐼 Admin Panel</div>
          <div className="text-[10px] font-black tracking-[0.1em] text-red bg-red/10 border border-red/30 rounded-lg px-2.5 py-1">HOST ONLY</div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 px-4 pb-safe">

          {/* ── CREATE MARKET ───────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Neuen Markt erstellen</div>

            {/* Frage */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Frage</label>
              <input type="text" value={newMarketQuestion} onChange={e => setNewMarketQuestion(e.target.value)} placeholder="Wer macht den nächsten Witz?" className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2 placeholder:text-muted placeholder:font-semibold" />
            </div>

            {/* Typ */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Markt-Typ</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['standard','hot-take','anonymous','combo'] as const).map(t => (
                  <div key={t} onClick={() => setNewMarketType(t)} className={clsx("bg-input border rounded-xl p-2.5 px-2 text-center text-[11px] font-extrabold cursor-pointer transition-all duration-150", newMarketType === t ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40 hover:text-blue2")}>
                    {t === 'standard' ? 'Standard' : t === 'hot-take' ? 'Hot Take ⚡' : t === 'anonymous' ? 'Anonym 🕵️' : 'Combo ×'}
                  </div>
                ))}
              </div>
            </div>

            {/* NEU: Antwort-Modus */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Antwort-Modus</label>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                <div onClick={() => setIsBinary(true)} className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all duration-150", isBinary ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40 hover:text-blue2")}>
                  Binär (JA/NEIN)
                </div>
                <div onClick={() => setIsBinary(false)} className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all duration-150", !isBinary ? "border-blue2/50 text-blue2 bg-blue/10" : "border-border text-muted hover:border-blue/40 hover:text-blue2")}>
                  Custom (bis zu 5)
                </div>
              </div>

              {/* Custom Options Builder */}
              {!isBinary && (
                <div className="flex flex-col gap-1.5">
                  {customOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0" style={{ backgroundColor: ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i] + '33', color: ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i] }}>
                        {i + 1}
                      </div>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => { const next = [...customOptions]; next[i] = e.target.value; setCustomOptions(next); }}
                        placeholder={`Option ${i + 1} (z.B. Max)`}
                        className="flex-1 bg-input border border-border rounded-xl p-2.5 px-3 text-white font-sans text-[13px] font-bold outline-none focus:border-blue2 placeholder:text-muted placeholder:font-semibold"
                      />
                      {customOptions.length > 2 && (
                        <button onClick={() => setCustomOptions(customOptions.filter((_, idx) => idx !== i))} className="w-7 h-7 rounded-lg bg-red/10 border border-red/25 text-red text-[12px] flex items-center justify-center hover:bg-red/20 transition-colors">✕</button>
                      )}
                    </div>
                  ))}
                  {customOptions.length < 5 && (
                    <button onClick={() => setCustomOptions([...customOptions, ''])} className="mt-1 w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-blue/40 transition-colors">
                      + Option hinzufügen
                    </button>
                  )}
                  {!validOptions && (
                    <div className="text-[10px] text-red/80 font-bold mt-1">Mindestens 2 Optionen mit Text eingeben</div>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleCreateMarket} disabled={!canCreate} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(59,110,255,0.3)] transition-all duration-200 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed">
              + Markt erstellen
            </button>
          </div>

          {/* ── MANAGE MARKETS ──────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Märkte verwalten</div>
            {markets.filter(m => m.status !== 'resolved').map(m => (
              <div key={m.id} className="bg-input rounded-xl p-2.5 px-3 mb-1.5">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="flex-1 text-[12px] font-bold text-white overflow-hidden text-ellipsis whitespace-nowrap min-w-0">{m.question}</span>
                  {m.status === 'open' && (
                    <button onClick={() => lockMarket(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">LOCK</button>
                  )}
                </div>
                {/* NEU: Dynamische WIN-Buttons je nach Optionen */}
                <div className="flex flex-wrap gap-1">
                  {m.options.map((opt, i) => {
                    const colors = ['text-green border-green/35 hover:bg-green/10','text-red border-red/35 hover:bg-red/10','text-blue2 border-blue2/35 hover:bg-blue/10','text-yellow border-yellow/35 hover:bg-yellow/10','text-purple2 border-purple2/35 hover:bg-purple/10'];
                    return (
                      <button key={opt.id} onClick={() => resolveMarket(m.id, opt.id)} className={clsx("text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap", colors[i] ?? colors[0])}>
                        ✓ {opt.label}
                      </button>
                    );
                  })}
                  <button onClick={() => resolveRollover(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-purple2 border-purple2/35 hover:bg-purple2/10">🎰 ROLLOVER</button>
                  <button onClick={() => resolveStorno(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-muted border-muted/35 hover:bg-muted/10">↩️ STORNO</button>
                </div>
              </div>
            ))}
            {markets.filter(m => m.status !== 'resolved').length === 0 && (
              <div className="text-[12px] text-muted text-center py-2">Keine aktiven Märkte</div>
            )}
          </div>

          {/* ── GIVE TOKENS ─────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Token vergeben</div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Spieler (Name)</label>
              <input type="text" value={givePlayerId} onChange={e => setGivePlayerId(e.target.value)} placeholder="Ben (Bankrott)" className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2 placeholder:text-muted placeholder:font-semibold" />
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Token</label>
              <input type="number" value={giveAmount} onChange={e => setGiveAmount(e.target.value)} className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2" />
            </div>
            <button onClick={handleGiveTokens} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-green to-[#00A86E] font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(0,214,143,0.3)] transition-all duration-200 hover:-translate-y-px">🪙 Tokens vergeben</button>
          </div>

          {/* ── JACKPOT ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Community Jackpot</div>
            <div className="text-center py-2.5 pb-3.5">
              <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">Im Jackpot</div>
              <div className="font-mono text-[40px] font-bold text-yellow leading-none drop-shadow-[0_0_30px_rgba(255,212,71,0.4)]">🪙 {jackpot}</div>
              <div className="text-[11px] text-muted mt-1">Wird automatisch beim nächsten Gewinn ausgezahlt</div>
            </div>
          </div>

          {/* ── SESSION ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Session beenden</div>
            <button onClick={() => navigate('/cashout')} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-red to-orange font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(255,61,90,0.3)] transition-all duration-200 hover:-translate-y-px mb-3">💰 CASHOUT SCREEN ÖFFNEN</button>
            <button onClick={async () => {
              if (window.confirm('Möchtest du wirklich alles zurücksetzen?')) {
                resetState();
                try { await resetToInitialState(INITIAL_PLAYERS, INITIAL_MARKETS); alert('Zurückgesetzt!'); }
                catch (e) { console.error(e); alert('Fehler beim Zurücksetzen.'); }
              }
            }} className="w-full p-3.5 border border-red/40 rounded-xl bg-red/10 font-sans text-[14px] font-black text-red cursor-pointer transition-all duration-200 hover:bg-red/20">
              ⚠️ ALLES ZURÜCKSETZEN (TESTING)
            </button>
          </div>

          <div className="mt-8 text-center">
            <button onClick={() => navigate('/dashboard')} className="text-muted text-[12px] underline">Zurück zum Dashboard</button>
          </div>
        </div>
      </div>
    </div>
  );
}