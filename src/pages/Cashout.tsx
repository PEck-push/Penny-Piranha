import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

function useCountUp(target: number, duration: number = 2000, startDelay: number = 0): number {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setCurrent(Math.floor(ease * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(timer);
  }, [target, duration, startDelay]);

  return current;
}

export default function Cashout() {
  const players = useStore(state => state.players);
  const storedRate = useStore(state => state.exchangeRate);
  const setExchangeRate = useStore(state => state.setExchangeRate);
  const navigate = useNavigate();

  // Lokaler Slider-Wert für flüssiges Ziehen; persistiert (geteilt für alle
  // Admins) erst beim Loslassen — kein Firestore-Write pro Drag-Schritt.
  const [rate, setRate] = useState(storedRate);
  useEffect(() => { setRate(storedRate); }, [storedRate]);
  const exchangeRate = rate;

  const sortedPlayers = [...players].sort((a, b) => b.tokens - a.tokens);
  // Nur echte Spieler (keine Test-Spieler) für die Auszahlungs-Gesamtsumme.
  const realPlayers = sortedPlayers.filter(p => !p.isTestPlayer);
  const totalTokens = realPlayers.reduce((s, p) => s + Math.max(0, p.tokens), 0);
  const totalEuro = (totalTokens / 100) * exchangeRate;

  return (
    <div className="flex-1 flex flex-col bg-[#02040C] relative h-full overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,212,71,.15)_0%,transparent_50%)]" />
      
      <div className="relative z-10 px-5 pt-10 pb-6 flex flex-col items-center">
        <div className="text-[48px] mb-2 animate-[float_3s_ease-in-out_infinite]">💰</div>
        <div className="text-[32px] font-black text-white tracking-tight mb-1">Cashout</div>
        <div className="text-[14px] text-muted mb-8">Ende der Session</div>

        <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 backdrop-blur-md">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] font-bold text-muted uppercase tracking-wider">Wechselkurs</span>
            <span className="font-mono text-[14px] font-bold text-yellow">100 TKN = {exchangeRate.toFixed(2)} €</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            onPointerUp={() => setExchangeRate(rate)}
            onTouchEnd={() => setExchangeRate(rate)}
            onMouseUp={() => setExchangeRate(rate)}
            className="w-full h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-yellow [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
            <span className="text-[12px] font-bold text-muted uppercase tracking-wider">Auszahlung gesamt</span>
            <span className="font-mono text-[15px] font-black text-green">{totalEuro.toFixed(2)} €</span>
          </div>
          <div className="text-[10px] text-muted/70 mt-1 text-right">
            {totalTokens.toLocaleString('de-AT')} TKN über {realPlayers.length} Spieler — mit dem realen Topf abgleichen
          </div>
        </div>

        <div className="w-full max-w-md flex flex-col gap-3">
          {sortedPlayers.map((p, i) => (
            <PlayerRow key={p.id} player={p} rank={i + 1} exchangeRate={exchangeRate} delay={i * 300} />
          ))}
        </div>

        <button 
          onClick={() => navigate('/admin')}
          className="mt-12 text-[12px] text-muted underline hover:text-white transition-colors"
        >
          Zurück zum Admin Panel
        </button>
      </div>
    </div>
  );
}

function PlayerRow({ player, rank, exchangeRate, delay }: { player: any, rank: number, exchangeRate: number, delay: number }) {
  const count = useCountUp(player.tokens, 2000, delay);
  const [showEuro, setShowEuro] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowEuro(true), delay + 2000);
    return () => clearTimeout(timer);
  }, [delay]);

  const isCounting = count > 0 && count < player.tokens;

  return (
    <div 
      className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 animate-[cpFloat_0.5s_ease-out_forwards]"
      style={{ animationDelay: `${delay}ms`, opacity: 0, animationFillMode: 'forwards' }}
    >
      <div className="font-mono text-[24px] font-black text-muted w-8 text-center">
        {rank}
      </div>
      <div className="flex-1">
        <div className="text-[18px] font-black text-white">{player.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={clsx(
            "font-mono text-[16px] font-bold transition-colors duration-300",
            isCounting ? "text-[#F0FF44]" : "text-white"
          )}>
            {count} TKN
          </span>
          {showEuro && (
            <span className="font-mono text-[16px] font-bold text-green animate-[float_0.5s_ease-out]">
              = {((player.tokens / 100) * exchangeRate).toFixed(2)} €
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
