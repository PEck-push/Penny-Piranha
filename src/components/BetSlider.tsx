import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  calcLivePayout,
  poolShare,
  FAVORITE_WARNING_THRESHOLD,
} from '../utils/credits';
import {
  effectiveMinBet,
  effectiveMaxBet,
  isSurvivalMode,
  type Phase,
} from '../utils/phase';

interface OptionView {
  id: string;
  label: string;
  pool: number;
}

interface Props {
  options: OptionView[];
  totalPool: number;
  seed?: number;
  tokens: number;
  phase: Phase;
  openGamesToday: number;
  selectedOptionId: string | null;
  onSelectOption: (id: string) => void;
  value: number;
  onChange: (v: number) => void;
}

// Wett-Slider mit Live-Payout-Anzeige, Favoriten-Warnhinweis (>75% Pool)
// und Überlebensmodus (Minimum 1 Cr. wenn Guthaben für alle Spiele nicht reicht).
export default function BetSlider({
  options,
  totalPool,
  seed = 0,
  tokens,
  phase,
  openGamesToday,
  selectedOptionId,
  onSelectOption,
  value,
  onChange,
}: Props) {
  const [touched, setTouched] = useState(false);

  const survival = isSurvivalMode(tokens, openGamesToday, phase);
  const min = effectiveMinBet(tokens, openGamesToday, phase);
  const max = Math.max(min, effectiveMaxBet(tokens, phase));

  const selected = options.find(o => o.id === selectedOptionId) ?? null;

  const livePayout = useMemo(() => {
    if (!selected) return 0;
    return calcLivePayout(value, selected.pool, totalPool, seed);
  }, [selected, value, totalPool, seed]);

  const share = selected ? poolShare(selected.pool, totalPool) : 0;
  const heavyFavorite = share > FAVORITE_WARNING_THRESHOLD;
  const profit = livePayout - value;

  return (
    <div className="flex flex-col gap-3">
      {survival && (
        <div className="bg-red/10 border border-red/30 rounded-xl p-3 text-center">
          <div className="text-[13px] font-black text-red">⚡ Du bist jetzt im Überlebensmodus!</div>
          <div className="text-[11px] text-muted mt-0.5">
            Mindesteinsatz aufgehoben — setze alles auf dein Sicherheitsspiel!
          </div>
        </div>
      )}

      {/* Optionen */}
      <div className={clsx('grid gap-2', options.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map(opt => {
          const active = opt.id === selectedOptionId;
          return (
            <button
              key={opt.id}
              onClick={() => onSelectOption(opt.id)}
              className={clsx(
                'rounded-2xl border-2 py-3 px-2 flex flex-col items-center gap-0.5 transition-all',
                active
                  ? 'border-green bg-green/15 text-white shadow-[0_0_20px_rgba(0,214,143,0.25)]'
                  : 'border-border bg-white/5 text-muted hover:border-blue/40',
              )}
            >
              <span className="text-[14px] font-black leading-none">{opt.label}</span>
              <span className="text-[10px] font-bold opacity-70">
                {Math.round(poolShare(opt.pool, totalPool) * 100)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Slider */}
      <div className="flex justify-between items-end">
        <span className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">Dein Einsatz</span>
        <span className="font-mono text-[18px] font-bold text-yellow">{value} TKN</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.min(Math.max(value, min), max)}
        onChange={e => { onChange(parseInt(e.target.value)); setTouched(true); }}
        className="w-full h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue [&::-webkit-slider-thumb]:to-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg"
      />
      <div className="flex justify-between text-[10px] font-mono text-muted">
        <span>min {min}</span>
        <span>max {max}{phase === 'finale' ? ' (All-in)' : ''}</span>
      </div>

      {/* Live-Payout */}
      {selected && (
        <div className="bg-card border border-border rounded-2xl p-3.5">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-muted">Möglicher Gewinn</span>
            <span className="font-mono text-[18px] font-bold text-green">{livePayout} TKN</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[12px] text-muted">Davon Gewinn</span>
            <span className={clsx('font-mono text-[13px] font-bold', profit > 0 ? 'text-green' : 'text-red')}>
              {profit >= 0 ? '+' : ''}{profit} TKN
            </span>
          </div>
          {heavyFavorite && (
            <div className="mt-2.5 bg-yellow/10 border border-yellow/25 rounded-lg p-2">
              <div className="text-[11px] font-black text-yellow">
                ⚠️ {Math.round(share * 100)}% des Topfs auf diese Option
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                Hier tippen fast alle — dein Gewinn wäre nur +{profit} Cr.
              </div>
            </div>
          )}
          {touched && (
            <div className="text-[9px] text-muted/60 mt-2 text-center">
              Stand jetzt — Gewinn sinkt wenn mehr auf diese Option tippen
            </div>
          )}
        </div>
      )}
    </div>
  );
}
