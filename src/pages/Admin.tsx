import { useState } from 'react';
import { useStore, INITIAL_PLAYERS, INITIAL_MARKETS, MarketOption } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { resetToInitialState } from '../services/db';

export default function Admin() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  // Market creation
  const [newMarketQuestion, setNewMarketQuestion] = useState('');
  const [newMarketType, setNewMarketType] = useState<'standard' | 'hot-take' | 'anonymous' | 'combo'>('standard');
  const [isBinary, setIsBinary] = useState(true);
  const [isOpenQuestion, setIsOpenQuestion] = useState(false);
  const [customOptions, setCustomOptions] = useState<string[]>(['', '']);
  const [hotTakeMinutes, setHotTakeMinutes] = useState(5); // NEW: configurable timer

  // Combo legs — standalone, admin types them freely
  const [comboLegs, setComboLegs] = useState<{ question: string; optionA: string; optionB: string }[]>([
    { question: '', optionA: 'JA', optionB: 'NEIN' },
  ]);

  // Token giving
  const [givePlayerId, setGivePlayerId] = useState('');
  const [giveAmount, setGiveAmount] = useState('20');

  // Resolution confirmation popup
  const [pendingResolution, setPendingResolution] = useState<{
    marketId: string; optionId: string; optionLabel: string; type: 'win' | 'rollover' | 'storno';
  } | null>(null);

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
      if (p === '1234') setTimeout(() => setUnlocked(true), 300);
      else if (p.length === 4) setTimeout(() => setPin(''), 500);
    }
  };

  // ── Options builder ────────────────────────────────────────────────────────
  const buildOptions = (): MarketOption[] => {
    if (newMarketType === 'combo') {
      return [
        { id: 'combo-win',  label: '✓ Alle richtig',  pool: 0 },
        { id: 'combo-miss', label: '✗ Mind. 1 falsch', pool: 0 },
      ];
    }
    if (isOpenQuestion) return [{ id: 'open', label: 'Offene Antwort', pool: 0 }];
    if (isBinary) return [{ id: 'yes', label: 'JA', pool: 0 }, { id: 'no', label: 'NEIN', pool: 0 }];
    return customOptions.filter(o => o.trim()).map(label => ({
      id: Math.random().toString(36).substring(7), label: label.trim(), pool: 0,
    }));
  };

  const validComboLegs = comboLegs.filter(l => l.question.trim() !== '');
  const validOptions = newMarketType === 'combo'
    ? validComboLegs.length >= 2
    : isOpenQuestion || isBinary || customOptions.filter(o => o.trim()).length >= 2;

  const canCreate = newMarketQuestion.trim() !== '' && validOptions;

  const handleCreateMarket = () => {
    if (!canCreate) return;
    const filledLegs = comboLegs.filter(l => l.question.trim() !== '');
    const multiplier = filledLegs.length === 3 ? 6 : 3;

    // For combo: build MarketComboLeg[] from standalone inputs
    const builtComboLegs = filledLegs.map(l => ({
      marketId: '',  // standalone — not linked to another market
      marketQuestion: l.question.trim(),
      predictedOptionId: Math.random().toString(36).substring(7),
      predictedOptionLabel: l.optionA.trim() || 'JA',
      status: 'pending' as const,
      optionB: l.optionB.trim() || 'NEIN',
    }));

    createMarket({
      question: newMarketQuestion,
      type: newMarketType,
      status: 'open',
      createdBy: 'admin',
      options: buildOptions(),
      winningOptionId: null,
      resolutionType: null,
      isOpenQuestion: newMarketType === 'anonymous' ? isOpenQuestion : false,
      ...(newMarketType === 'hot-take' ? { expiresAt: Date.now() + hotTakeMinutes * 60 * 1000 } : {}),
      ...(newMarketType === 'combo' ? { comboLegs: builtComboLegs, multiplier } : {}),
    });
    setNewMarketQuestion('');
    setCustomOptions(['', '']);
    setIsBinary(true);
    setIsOpenQuestion(false);
    setComboLegs([{ question: '', optionA: 'JA', optionB: 'NEIN' }]);
    setHotTakeMinutes(5);
  };

  const handleGiveTokens = () => {
    const player = players.find(p => p.name.toLowerCase() === givePlayerId.toLowerCase() || p.id === givePlayerId);
    if (player && giveAmount) { giveTokens(player.id, parseInt(giveAmount)); setGivePlayerId(''); }
  };

  const executeResolution = async () => {
    if (!pendingResolution) return;
    const { marketId, optionId, type } = pendingResolution;
    if (type === 'win') await resolveMarket(marketId, optionId);
    else if (type === 'rollover') await resolveRollover(marketId);
    else await resolveStorno(marketId);
    setPendingResolution(null);
  };

  // ── PIN Screen ─────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        <div className="absolute inset-0 z-[100] bg-[#02040C]/95 backdrop-blur-2xl flex flex-col items-center justify-center">
          <button onClick={() => navigate('/dashboard')} className="absolute top-6 left-6 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors">✕</button>
          <div className="text-[70px] mb-3 animate-[float_3s_ease-in-out_infinite]">🐼</div>
          <div className="text-[18px] font-black text-white mb-1">Admin-Zugang</div>
          <div className="text-[12px] text-muted mb-7">Nur für den Host · PIN: 1234</div>
          <div className="flex gap-3 mb-8">
            {[0,1,2,3].map(i => (
              <div key={i} className={clsx("w-3.5 h-3.5 rounded-full border-2 transition-all", i < pin.length ? "bg-blue2 border-blue2 shadow-[0_0_12px_rgba(93,143,255,0.6)]" : "border-white/10 bg-transparent")} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 w-[230px]">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <div key={n} onClick={() => handlePinInput(n.toString())} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer hover:bg-bg3 hover:border-blue/40 active:scale-90 transition-all">{n}</div>
            ))}
            <div onClick={() => setPin(pin.slice(0,-1))} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[16px] text-muted flex items-center justify-center cursor-pointer hover:bg-bg3 active:scale-90 transition-all">⌫</div>
            <div onClick={() => handlePinInput('0')} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer hover:bg-bg3 active:scale-90 transition-all">0</div>
            <div onClick={() => navigate('/dashboard')} className="aspect-square rounded-2xl bg-green/10 border border-green/40 text-green font-mono text-[22px] font-bold flex items-center justify-center cursor-pointer active:scale-90 transition-all">✕</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin Panel ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,61,90,.12)_0%,transparent_40%)]" />
      <div className="relative z-10 flex flex-col flex-1">
        <div className="p-3.5 px-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="text-[17px] font-black text-white">🐼 Admin Panel</div>
          <div className="text-[10px] font-black tracking-[0.1em] text-red bg-red/10 border border-red/30 rounded-lg px-2.5 py-1">HOST ONLY</div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 px-4 pb-safe">

          {/* ── CREATE MARKET ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Neuen Markt erstellen</div>

            {/* Frage */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Frage / Titel</label>
              <input type="text" value={newMarketQuestion} onChange={e => setNewMarketQuestion(e.target.value)}
                placeholder="Was passiert als nächstes?" className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 placeholder:text-muted" />
            </div>

            {/* Typ */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Markt-Typ</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['standard','hot-take','anonymous','combo'] as const).map(t => (
                  <div key={t} onClick={() => { setNewMarketType(t); setIsOpenQuestion(false); setComboLegs([]); }}
                    className={clsx("bg-input border rounded-xl p-2.5 px-2 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      newMarketType === t ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40 hover:text-blue2")}>
                    {t === 'standard' ? 'Standard' : t === 'hot-take' ? '⚡ Hot Take' : t === 'anonymous' ? '🕵️ Anonym' : '🔗 Combo'}
                  </div>
                ))}
              </div>
            </div>

            {/* ── HOT TAKE: Timer ───────────────────────────────── */}
            {newMarketType === 'hot-take' && (
              <div className="mb-3 bg-blue/10 border border-blue2/30 rounded-xl p-3">
                <label className="block text-[10px] font-black text-blue2 tracking-[0.12em] uppercase mb-2">⏱ Timer (Minuten)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="1" max="30" value={hotTakeMinutes}
                    onChange={e => setHotTakeMinutes(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="font-mono text-[18px] font-bold text-blue2 min-w-[48px] text-right">{hotTakeMinutes}m</div>
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-muted font-bold">
                  <span>1 min</span><span>30 min</span>
                </div>
                <div className="text-[10px] text-muted mt-1.5">Wettannahme endet automatisch nach {hotTakeMinutes} Minute{hotTakeMinutes > 1 ? 'n' : ''}.</div>
              </div>
            )}

            {/* ── COMBO: Standalone Leg Builder ────────────────── */}
            {newMarketType === 'combo' && (
              <div className="mb-3">
                <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2">
                  Combo-Fragen ({validComboLegs.length}/3)
                  {validComboLegs.length === 2 && <span className="text-green ml-1">· 3× Multiplikator</span>}
                  {validComboLegs.length === 3 && <span className="text-yellow ml-1">· 6× Multiplikator</span>}
                </label>

                {comboLegs.map((leg, i) => (
                  <div key={i} className="bg-input border border-border rounded-xl p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-purple/20 border border-purple2/30 flex items-center justify-center text-[10px] font-black text-purple2 shrink-0">{i+1}</div>
                      <input
                        type="text"
                        value={leg.question}
                        onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], question: e.target.value }; setComboLegs(n); }}
                        placeholder={`Frage ${i+1}…`}
                        className="flex-1 bg-bg border border-border rounded-lg p-2 px-2.5 text-white font-sans text-[13px] font-bold outline-none focus:border-purple2 placeholder:text-muted"
                      />
                      {comboLegs.length > 1 && (
                        <button onClick={() => setComboLegs(comboLegs.filter((_, idx) => idx !== i))}
                          className="w-6 h-6 rounded-lg bg-red/10 border border-red/25 text-red text-[10px] flex items-center justify-center hover:bg-red/20 shrink-0">✕</button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="text-[9px] font-black text-green/70 uppercase tracking-wider mb-1">Option A</div>
                        <input
                          type="text"
                          value={leg.optionA}
                          onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], optionA: e.target.value }; setComboLegs(n); }}
                          className="w-full bg-bg border border-green/25 rounded-lg p-2 px-2.5 text-green font-sans text-[12px] font-bold outline-none focus:border-green/60 placeholder:text-muted"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] font-black text-red/70 uppercase tracking-wider mb-1">Option B</div>
                        <input
                          type="text"
                          value={leg.optionB}
                          onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], optionB: e.target.value }; setComboLegs(n); }}
                          className="w-full bg-bg border border-red/25 rounded-lg p-2 px-2.5 text-red font-sans text-[12px] font-bold outline-none focus:border-red/60 placeholder:text-muted"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {comboLegs.length < 3 && (
                  <button onClick={() => setComboLegs([...comboLegs, { question: '', optionA: 'JA', optionB: 'NEIN' }])}
                    className="w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-purple2/40 transition-colors">
                    + Frage hinzufügen
                  </button>
                )}
                {validComboLegs.length < 2 && (
                  <div className="text-[10px] text-muted mt-1.5">Mindestens 2 ausgefüllte Fragen erforderlich.</div>
                )}
              </div>
            )}

            {/* ── STANDARD / HOT-TAKE / ANONYMOUS: Antwort-Modus ── */}
            {newMarketType !== 'combo' && (
              <div className="mb-3">
                <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Antwort-Modus</label>
                <div className={clsx("grid gap-1.5 mb-2", newMarketType === 'anonymous' ? 'grid-cols-3' : 'grid-cols-2')}>
                  <div onClick={() => { setIsBinary(true); setIsOpenQuestion(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      isBinary && !isOpenQuestion ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40")}>
                    Binär (JA/NEIN)
                  </div>
                  <div onClick={() => { setIsBinary(false); setIsOpenQuestion(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      !isBinary && !isOpenQuestion ? "border-blue2/50 text-blue2 bg-blue/10" : "border-border text-muted hover:border-blue/40")}>
                    Custom
                  </div>
                  {newMarketType === 'anonymous' && (
                    <div onClick={() => { setIsOpenQuestion(true); setIsBinary(false); }}
                      className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                        isOpenQuestion ? "border-purple2/50 text-purple2 bg-purple/10" : "border-border text-muted hover:border-blue/40")}>
                      ✏️ Offen
                    </div>
                  )}
                </div>

                {isOpenQuestion && (
                  <div className="bg-purple/10 border border-purple2/30 rounded-xl p-2.5 text-[11px] text-purple2 font-bold">
                    ✏️ Spieler tippen frei. Antworten bleiben bis zur Auflösung anonym.
                  </div>
                )}

                {!isBinary && !isOpenQuestion && (
                  <div className="flex flex-col gap-1.5">
                    {customOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                          style={{ backgroundColor: ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i]+'33', color: ['#00D68F','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i] }}>
                          {i+1}
                        </div>
                        <input type="text" value={opt} onChange={e => { const n=[...customOptions]; n[i]=e.target.value; setCustomOptions(n); }}
                          placeholder={`Option ${i+1}`}
                          className="flex-1 bg-input border border-border rounded-xl p-2.5 px-3 text-white font-sans text-[13px] font-bold outline-none focus:border-blue2 placeholder:text-muted" />
                        {customOptions.length > 2 && (
                          <button onClick={() => setCustomOptions(customOptions.filter((_,idx)=>idx!==i))}
                            className="w-7 h-7 rounded-lg bg-red/10 border border-red/25 text-red text-[12px] flex items-center justify-center hover:bg-red/20">✕</button>
                        )}
                      </div>
                    ))}
                    {customOptions.length < 5 && (
                      <button onClick={() => setCustomOptions([...customOptions,''])}
                        className="mt-1 w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-blue/40 transition-colors">
                        + Option hinzufügen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleCreateMarket} disabled={!canCreate}
              className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed">
              + Markt erstellen
            </button>
          </div>

          {/* ── MANAGE MARKETS ──────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Märkte verwalten</div>
            {markets.filter(m => m.status !== 'resolved').map(m => (
              <div key={m.id} className="bg-input rounded-xl p-2.5 px-3 mb-1.5">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="flex-1 text-[12px] font-bold text-white truncate min-w-0">{m.question}</span>
                  {m.status === 'open' && (
                    <button onClick={() => lockMarket(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">LOCK</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.options.map((opt, i) => {
                    const colors = ['text-green border-green/35 hover:bg-green/10','text-red border-red/35 hover:bg-red/10','text-blue2 border-blue2/35 hover:bg-blue/10','text-yellow border-yellow/35 hover:bg-yellow/10','text-purple2 border-purple2/35 hover:bg-purple/10'];
                    return (
                      <button key={opt.id}
                        onClick={() => setPendingResolution({ marketId: m.id, optionId: opt.id, optionLabel: opt.label, type: 'win' })}
                        className={clsx("text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap transition-all", colors[i] ?? colors[0])}>
                        ✓ {opt.label}
                      </button>
                    );
                  })}
                  {m.type !== 'combo' && (
                    <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'ROLLOVER', type: 'rollover' })}
                      className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-purple2 border-purple2/35 hover:bg-purple2/10">
                      🎰 ROLLOVER
                    </button>
                  )}
                  <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'STORNO', type: 'storno' })}
                    className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-muted border-muted/35 hover:bg-muted/10">
                    ↩️ STORNO
                  </button>
                </div>
                {/* Show combo legs status */}
                {m.type === 'combo' && m.comboLegs && (
                  <div className="mt-2 flex flex-col gap-1">
                    {m.comboLegs.map((leg, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className={clsx("font-black", leg.status === 'hit' ? 'text-green' : leg.status === 'miss' ? 'text-red' : 'text-muted')}>
                          {leg.status === 'hit' ? '✓' : leg.status === 'miss' ? '✗' : '○'}
                        </span>
                        <span className="text-muted truncate">{leg.marketQuestion}</span>
                        <span className="text-white font-bold shrink-0">→ {leg.predictedOptionLabel}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {markets.filter(m => m.status !== 'resolved').length === 0 && (
              <div className="text-[12px] text-muted text-center py-2">Keine aktiven Märkte</div>
            )}
          </div>

          {/* ── GIVE TOKENS ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Token vergeben</div>
            <input type="text" value={givePlayerId} onChange={e => setGivePlayerId(e.target.value)} placeholder="Name des Spielers"
              className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 placeholder:text-muted mb-3" />
            <input type="number" value={giveAmount} onChange={e => setGiveAmount(e.target.value)}
              className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 mb-3" />
            <button onClick={handleGiveTokens} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-green to-[#00A86E] font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(0,214,143,0.3)] transition-all hover:-translate-y-px">🪙 Tokens vergeben</button>
          </div>

          {/* ── JACKPOT ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Community Jackpot</div>
            <div className="text-center py-2">
              <div className="font-mono text-[40px] font-bold text-yellow drop-shadow-[0_0_30px_rgba(255,212,71,0.4)]">🪙 {jackpot}</div>
              <div className="text-[11px] text-muted mt-1">Wird beim nächsten Gewinn ausgezahlt</div>
            </div>
          </div>

          {/* ── SESSION ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Session</div>
            <button onClick={() => navigate('/cashout')} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-red to-orange font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(255,61,90,0.3)] transition-all hover:-translate-y-px mb-3">💰 CASHOUT ÖFFNEN</button>
            <button onClick={async () => {
              if (window.confirm('Wirklich alles zurücksetzen?')) {
                resetState();
                try { await resetToInitialState(INITIAL_PLAYERS, INITIAL_MARKETS); alert('Zurückgesetzt!'); }
                catch (e) { console.error(e); alert('Fehler.'); }
              }
            }} className="w-full p-3.5 border border-red/40 rounded-xl bg-red/10 font-sans text-[14px] font-black text-red cursor-pointer transition-all hover:bg-red/20">
              ⚠️ ALLES ZURÜCKSETZEN
            </button>
          </div>

          <div className="mt-8 text-center mb-6">
            <button onClick={() => navigate('/dashboard')} className="text-muted text-[12px] underline">Zurück zum Dashboard</button>
          </div>
        </div>
      </div>

      {/* ── RESOLUTION CONFIRMATION ─────────────────────────────────── */}
      {pendingResolution && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">⚠️</div>
            <div className="text-[20px] font-black text-white mb-2">Ergebnis bestätigen</div>
            <div className="text-[14px] text-muted mb-2 leading-relaxed">
              {pendingResolution.type === 'win' && <>Gewinner: <b className="text-white">„{pendingResolution.optionLabel}"</b></>}
              {pendingResolution.type === 'rollover' && <><b className="text-purple2">ROLLOVER</b> durchführen?</>}
              {pendingResolution.type === 'storno' && <><b className="text-muted">STORNO</b> — alle erhalten Einsatz zurück.</>}
            </div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setPendingResolution(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={executeResolution} className="flex-1 p-3 rounded-xl font-bold text-white bg-gradient-to-r from-red to-orange shadow-[0_0_15px_rgba(255,61,90,0.4)] transition-all">Bestätigen ✓</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}