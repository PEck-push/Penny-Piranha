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
  const navigate = useNavigate();
  const [exchangeRate, setExchangeRate] = useState(1); // 100 Token = 1 Euro

  const sortedPlayers = [...players].sort((a, b) => b.tokens - a.tokens);

  return (
    <div className="flex-1 flex flex-col bg-[#02040C] relative min-h-screen overflow-hidden">
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
            value={exchangeRate} 
            onChange={(e) => setExchangeRate(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-yellow [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
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
