import { useState } from 'react';
import { useStore, INITIAL_PLAYERS, INITIAL_MARKETS } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { resetToInitialState } from '../services/db';

export default function Admin() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [newMarketQuestion, setNewMarketQuestion] = useState('');
  const [newMarketType, setNewMarketType] = useState<'standard' | 'hot-take' | 'anonymous' | 'combo'>('standard');
  const [givePlayerId, setGivePlayerId] = useState('');
  const [giveAmount, setGiveAmount] = useState('20');

  const markets = useStore(state => state.markets);
  const jackpot = useStore(state => state.jackpot);
  const createMarket = useStore(state => state.createMarket);
  const resolveMarket = useStore(state => state.resolveMarket);
  const resolveRollover = useStore(state => state.resolveRollover);
  const resolveStorno = useStore(state => state.resolveStorno);
  const lockMarket = useStore(state => state.lockMarket);
  const giveTokens = useStore(state => state.giveTokens);
  const resetState = useStore(state => state.resetState);
  const players = useStore(state => state.players);
  const navigate = useNavigate();

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin === '1234') { // Hardcoded PIN for demo
        setTimeout(() => setUnlocked(true), 300);
      } else if (newPin.length === 4) {
        setTimeout(() => setPin(''), 500); // Reset on wrong PIN
      }
    }
  };

  const handleCreateMarket = () => {
    if (newMarketQuestion) {
      createMarket({
        question: newMarketQuestion,
        type: newMarketType,
        status: 'open',
        createdBy: 'admin',
        ...(newMarketType === 'hot-take' ? { expiresAt: Date.now() + 60000 } : {})
      });
      setNewMarketQuestion('');
    }
  };

  const handleGiveTokens = () => {
    const player = players.find(p => p.name.toLowerCase() === givePlayerId.toLowerCase() || p.id === givePlayerId);
    if (player && giveAmount) {
      giveTokens(player.id, parseInt(giveAmount));
      setGivePlayerId('');
    }
  };

  if (!unlocked) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        <div className="absolute inset-0 z-[100] bg-[#02040C]/95 backdrop-blur-2xl flex flex-col items-center justify-center">
          <div className="text-[70px] mb-3 animate-[float_3s_ease-in-out_infinite]">🐼</div>
          <div className="text-[18px] font-black text-white mb-1">Admin-Zugang</div>
          <div className="text-[12px] text-muted mb-7">Nur für den Host · PIN eingeben (1234)</div>
          
          <div className="flex gap-3 mb-8">
            {[0, 1, 2, 3].map(i => (
              <div 
                key={i} 
                className={clsx(
                  "w-3.5 h-3.5 rounded-full border-2 transition-all duration-200",
                  i < pin.length ? "bg-blue2 border-blue2 shadow-[0_0_12px_rgba(93,143,255,0.6)]" : "border-white/10 bg-transparent"
                )} 
              />
            ))}
          </div>
          
          <div className="grid grid-cols-3 gap-2.5 w-[230px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <div 
                key={num}
                onClick={() => handlePinInput(num.toString())}
                className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90"
              >
                {num}
              </div>
            ))}
            <div 
              onClick={() => setPin(pin.slice(0, -1))}
              className="aspect-square rounded-2xl bg-card border border-border font-mono text-[16px] text-muted flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90"
            >
              ⌫
            </div>
            <div 
              onClick={() => handlePinInput('0')}
              className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90"
            >
              0
            </div>
            <div 
              onClick={() => navigate('/dashboard')}
              className="aspect-square rounded-2xl bg-green/10 border border-green/40 text-green font-mono text-[22px] font-bold flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-bg3 hover:border-blue/40 active:scale-90"
            >
              ✕
            </div>
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
          {/* Create Market */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Neuen Markt erstellen</div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Frage</label>
              <input 
                type="text" 
                value={newMarketQuestion}
                onChange={(e) => setNewMarketQuestion(e.target.value)}
                placeholder="Wer macht den nächsten Witz?"
                className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2 placeholder:text-muted placeholder:font-semibold"
              />
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Typ</label>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {(['standard', 'hot-take', 'anonymous', 'combo'] as const).map(type => (
                  <div 
                    key={type}
                    onClick={() => setNewMarketType(type)}
                    className={clsx(
                      "bg-input border rounded-xl p-2.5 px-2 text-center text-[11px] font-extrabold cursor-pointer transition-all duration-150",
                      newMarketType === type 
                        ? "border-green/50 text-green bg-green/10" 
                        : "border-border text-muted hover:border-blue/40 hover:text-blue2"
                    )}
                  >
                    {type === 'standard' ? 'Standard' : type === 'hot-take' ? 'Hot Take ⚡' : type === 'anonymous' ? 'Anonym 🕵️' : 'Combo ×'}
                  </div>
                ))}
              </div>
            </div>
            <button 
              onClick={handleCreateMarket}
              className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(59,110,255,0.3)] transition-all duration-200 hover:-translate-y-px"
            >
              + Markt erstellen
            </button>
          </div>

          {/* Manage Markets */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Märkte verwalten</div>
            {markets.filter(m => m.status !== 'resolved').map(m => (
              <div key={m.id} className="bg-input rounded-xl p-2.5 px-3 mb-1.5 flex items-center gap-2">
                <span className="flex-1 text-[12px] font-bold text-white overflow-hidden text-ellipsis whitespace-nowrap">{m.question}</span>
                {m.status === 'open' && (
                  <button onClick={() => lockMarket(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">LOCK</button>
                )}
                <button onClick={() => resolveMarket(m.id, 'yes')} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-green border-green/35 hover:bg-green/10">JA</button>
                <button onClick={() => resolveMarket(m.id, 'no')} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-red border-red/35 hover:bg-red/10">NEIN</button>
                <button onClick={() => resolveRollover(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-purple2 border-purple2/35 hover:bg-purple2/10">🎰 ROLLOVER</button>
                <button onClick={() => resolveStorno(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans transition-all duration-100 whitespace-nowrap text-muted border-muted/35 hover:bg-muted/10">↩️ STORNO</button>
              </div>
            ))}
            {markets.filter(m => m.status !== 'resolved').length === 0 && (
              <div className="text-[12px] text-muted text-center py-2">Keine aktiven Märkte</div>
            )}
          </div>

          {/* Give Tokens */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Token vergeben</div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Spieler (Name)</label>
              <input 
                type="text" 
                value={givePlayerId}
                onChange={(e) => setGivePlayerId(e.target.value)}
                placeholder="Ben (Bankrott)"
                className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2 placeholder:text-muted placeholder:font-semibold"
              />
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Token</label>
              <input 
                type="number" 
                value={giveAmount}
                onChange={(e) => setGiveAmount(e.target.value)}
                className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none transition-colors duration-200 focus:border-blue2 placeholder:text-muted placeholder:font-semibold"
              />
            </div>
            <button 
              onClick={handleGiveTokens}
              className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-green to-[#00A86E] font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(0,214,143,0.3)] transition-all duration-200 hover:-translate-y-px"
            >
              🪙 Tokens vergeben
            </button>
          </div>

          {/* Jackpot */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Community Jackpot</div>
            <div className="text-center py-2.5 pb-3.5">
              <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">Im Jackpot</div>
              <div className="font-mono text-[40px] font-bold text-yellow leading-none drop-shadow-[0_0_30px_rgba(255,212,71,0.4)]">🪙 {jackpot}</div>
              <div className="text-[11px] text-muted mt-1">Wird automatisch beim nächsten Gewinn ausgeschüttet</div>
            </div>
          </div>

          {/* Session */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Session beenden</div>
            <button onClick={() => navigate('/cashout')} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-red to-orange font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(255,61,90,0.3)] transition-all duration-200 hover:-translate-y-px mb-3">
              💰 CASHOUT SCREEN ÖFFNEN
            </button>
            <button 
              onClick={async () => {
                if (window.confirm('Möchtest du wirklich alles auf den Ausgangszustand zurücksetzen? Alle Wetten und Märkte gehen verloren!')) {
                  resetState();
                  try {
                    await resetToInitialState(INITIAL_PLAYERS, INITIAL_MARKETS);
                    alert('Zurückgesetzt!');
                  } catch (e) {
                    console.error(e);
                    alert('Fehler beim Zurücksetzen der Datenbank.');
                  }
                }
              }} 
              className="w-full p-3.5 border border-red/40 rounded-xl bg-red/10 font-sans text-[14px] font-black text-red cursor-pointer transition-all duration-200 hover:bg-red/20"
            >
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
