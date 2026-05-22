import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

interface RevealScreenProps {
  marketIds: string[];
  onDone: () => void;
}

export default function RevealScreen({ marketIds, onDone }: RevealScreenProps) {
  const [index, setIndex] = useState(0);
  const [animIn, setAnimIn] = useState(true);

  const markets  = useStore(s => s.markets);
  const bets     = useStore(s => s.bets);
  const players  = useStore(s => s.players);
  const currentUser = useStore(s => s.currentUser);

  const marketId = marketIds[index];
  const market   = markets.find(m => m.id === marketId);
  const myBet    = bets.find(b => b.marketId === marketId && b.playerId === currentUser);
  const total    = marketIds.length;

  const isCorrect =
    market?.status === 'resolved' &&
    market.winningOptionId != null &&
    myBet?.optionId === market.winningOptionId;

  const isWrong =
    market?.status === 'resolved' &&
    market.winningOptionId != null &&
    myBet != null &&
    myBet.optionId !== market.winningOptionId;

  const payout = isCorrect && myBet
    ? (() => {
        const winPool = market?.options.find(o => o.id === market.winningOptionId)?.pool ?? 0;
        const poolTotal = market?.options.reduce((s, o) => s + o.pool, 0) ?? 0;
        if (winPool === 0) return myBet.amount;
        return Math.floor((myBet.amount / winPool) * poolTotal);
      })()
    : 0;

  // Remove the marketId from Firestore unseenResolutions after viewing
  const markSeen = async () => {
    if (!currentUser || !marketId || !db) return;
    try {
      await updateDoc(doc(db, 'players', currentUser), {
        unseenResolutions: arrayRemove(marketId),
      });
    } catch {
      // silently ignore — will try again next session
    }
  };

  const handleNext = async () => {
    await markSeen();
    setAnimIn(false);
    setTimeout(() => {
      if (index + 1 >= total) {
        onDone();
      } else {
        setIndex(i => i + 1);
        setAnimIn(true);
      }
    }, 200);
  };

  // Keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') handleNext(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total]);

  if (!market) {
    // Market not in store yet — skip
    handleNext();
    return null;
  }

  const winOption = market.options.find(o => o.id === market.winningOptionId);
  const poolTotal = market.options.reduce((s, o) => s + o.pool, 0);

  const teamA = market.teamA ?? market.options[0]?.label ?? '?';
  const teamB = market.teamB ?? market.options[2]?.label ?? '?';
  const isWmMatch = market.marketSubtype === 'wm-match';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#02040C]">
      {/* Background glow */}
      <div className={clsx(
        'absolute inset-0 transition-all duration-700',
        isCorrect
          ? 'bg-[radial-gradient(ellipse_at_50%_30%,rgba(0,214,143,.25)_0%,transparent_60%)]'
          : isWrong
          ? 'bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,61,90,.18)_0%,transparent_60%)]'
          : 'bg-[radial-gradient(ellipse_at_50%_30%,rgba(59,110,255,.15)_0%,transparent_60%)]',
      )} />

      {/* Content */}
      <div className={clsx(
        'relative z-10 w-full max-w-[430px] flex flex-col items-center pb-10 px-6 transition-all duration-300',
        animIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      )}>
        {/* Progress dots */}
        <div className="flex gap-1.5 pt-10 pb-8">
          {marketIds.map((_, i) => (
            <div key={i} className={clsx(
              'h-1 rounded-full transition-all duration-300',
              i < index  ? 'w-4 bg-white/30' :
              i === index ? 'w-8 bg-white' :
                            'w-4 bg-white/15',
            )} />
          ))}
        </div>

        {/* Label */}
        <div className="text-[11px] font-black text-muted/60 tracking-[0.15em] uppercase mb-2">
          Ergebnis {index + 1}/{total}
        </div>

        {/* Match or question */}
        {isWmMatch ? (
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center">
              <div className="text-[18px] font-black text-white">{teamA}</div>
            </div>
            <div className="text-[13px] font-black text-muted/60 px-3">VS</div>
            <div className="text-center">
              <div className="text-[18px] font-black text-white">{teamB}</div>
            </div>
          </div>
        ) : (
          <div className="text-[18px] font-black text-white text-center leading-[1.3] mb-6 px-2">
            {market.question}
          </div>
        )}

        {/* Result badge */}
        {winOption && (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-8 py-4 text-center mb-6">
            <div className="text-[11px] font-black text-muted/60 uppercase tracking-[0.12em] mb-1">
              {isWmMatch ? 'Ergebnis' : 'Gewinner'}
            </div>
            <div className="text-[24px] font-black text-white">{winOption.label}</div>
          </div>
        )}

        {/* No bet */}
        {!myBet && (
          <div className="w-full bg-muted/5 border border-white/8 rounded-2xl p-5 text-center mb-6">
            <div className="text-[40px] mb-2">💤</div>
            <div className="text-[16px] font-black text-muted">Kein Tipp abgegeben</div>
            <div className="text-[12px] text-muted/60 mt-1">Auto-Abzug wurde verrechnet</div>
          </div>
        )}

        {/* Correct */}
        {isCorrect && myBet && (
          <div className="w-full bg-green/10 border border-green/30 rounded-2xl p-5 text-center mb-6 relative overflow-hidden">
            <div className="absolute inset-0 animate-[pulse_2s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_50%_50%,rgba(0,214,143,.15)_0%,transparent_70%)]" />
            <div className="relative">
              <div className="text-[48px] mb-2">✅</div>
              <div className="text-[22px] font-black text-green mb-1">RICHTIG!</div>
              <div className="text-[13px] text-muted mb-3">
                Tipp: <b className="text-white">{myBet.optionLabel}</b>
                {' · '}
                Einsatz: <b className="text-white">{myBet.amount} Cr.</b>
              </div>
              <div className="text-[32px] font-black text-green">+{payout} Cr.</div>
            </div>
          </div>
        )}

        {/* Wrong */}
        {isWrong && myBet && (
          <div className="w-full bg-red/10 border border-red/30 rounded-2xl p-5 text-center mb-6">
            <div className="text-[48px] mb-2">❌</div>
            <div className="text-[22px] font-black text-red mb-1">LEIDER FALSCH</div>
            <div className="text-[13px] text-muted mb-2">
              Dein Tipp: <b className="text-white">{myBet.optionLabel}</b>
            </div>
            <div className="text-[28px] font-black text-red/80">-{myBet.amount} Cr.</div>
          </div>
        )}

        {/* Pool overview */}
        {poolTotal > 0 && (
          <div className="w-full bg-card border border-border rounded-2xl p-4 mb-8">
            <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-2">Pool-Verteilung</div>
            <div className="h-2 rounded-full overflow-hidden flex mb-2">
              {market.options.map((opt, i) => (
                <div key={opt.id} className="h-full transition-all"
                  style={{
                    width: `${(opt.pool / poolTotal) * 100}%`,
                    backgroundColor: ['#3B6EFF','#FFD447','#FF3D5A','#00D68F','#8B3DFF'][i],
                  }} />
              ))}
            </div>
            <div className="flex justify-between">
              {market.options.map((opt, i) => (
                <div key={opt.id} className="flex-1 text-center">
                  <div className="text-[11px] font-black text-white/70">
                    {Math.round((opt.pool / poolTotal) * 100)}%
                  </div>
                  <div className="text-[9px] text-muted truncate px-1">{opt.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleNext}
          className="w-full p-[16px] border-none rounded-[18px] bg-gradient-to-br from-green to-[#00A86E] font-sans text-[16px] font-black text-bg cursor-pointer tracking-[0.02em] shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_50px_rgba(0,214,143,0.5)]"
        >
          {index + 1 < total ? `Weiter (${index + 1}/${total})` : 'Zum Dashboard →'}
        </button>
      </div>
    </div>
  );
}
