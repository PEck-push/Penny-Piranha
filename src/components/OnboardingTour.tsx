import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

interface Step {
  title: string;
  body: string;
  /** data-tour-Attribut(e) der hervorzuhebenden Elemente. */
  target?: string | string[];
}

const STEPS: Step[] = [
  {
    title: 'Willkommen, Prophet! 🍺',
    body: 'Bei den Krügerl-Propheten spielst du nicht gegen feste Quoten wie beim Wettbüro. Alle Einsätze einer Frage fließen in einen gemeinsamen Topf — und die richtigen Tipper teilen ihn unter sich auf. Heißt: Je weniger andere dasselbe tippen wie du, desto mehr bekommst du raus.',
  },
  {
    title: 'Token & Jackpot',
    body: 'Du startest mit 1.000 Token — damit wettest du. Der Jackpot oben ist vor allem die Preiskasse für die Gratis-Sonderwetten und kommt aus der Hausbank. Liegt bei einer normalen Wette niemand richtig, fließt der Pool zusätzlich in den Jackpot.',
    target: ['jackpot', 'tokens'],
  },
  {
    title: 'Wo wird getippt?',
    body: 'WM-Spiele tippst du im Tab „Spielplan" — unten in der Leiste. Sonderwetten und Gratis-Runden findest du hier im Dashboard. Wichtig: Jedes offene Spiel muss getippt werden, sonst kostet es Token.',
    target: 'tab-spielplan',
  },
  {
    title: 'Hilfe & Tipps',
    body: 'Über das ❓-Symbol oben erreichst du den Hilfe-Bereich. Dort findest du alle Regeln, einen Tipps-Bereich für Anfänger und bald auch eine kurze Audio-Erklärung. Schau rein, wann immer du unsicher bist.',
    target: 'help',
  },
  {
    title: 'Dein Profil',
    body: 'Tippe auf deinen Charakter in der Mitte — dort siehst du deine Statistiken, kannst Accessoires anziehen und dein Passwort ändern. In der Rangliste kannst du übrigens auch jeden anderen Spieler antippen. Viel Glück! 🏆',
    target: 'profile',
  },
];

const PAD = 8;
const RADIUS = 16;

// Spotlight-Coachmark-Tour: highlightet ein oder mehrere thematisierte Elemente
// per Goldring + dunklem Umfeld (SVG-Maske mit Cutouts). Schritte ohne target
// zeigen nur die zentrierte Karte mit dunklem Backdrop.
export default function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));

  const [rects, setRects] = useState<DOMRect[]>([]);

  useEffect(() => {
    const targets = !step.target ? [] : Array.isArray(step.target) ? step.target : [step.target];
    if (!targets.length) { setRects([]); return; }
    const find = () => {
      const found = targets
        .map(t => document.querySelector(`[data-tour="${t}"]`))
        .filter((el): el is HTMLElement => !!el)
        .map(el => el.getBoundingClientRect());
      setRects(found);
    };
    // Mini-Delay, damit das Target sicher gerendert ist (z. B. nach Tab-Wechsel)
    const t = setTimeout(find, 50);
    window.addEventListener('resize', find);
    return () => { clearTimeout(t); window.removeEventListener('resize', find); };
  }, [i, step.target]);

  const hasRects = rects.length > 0;

  // Bounding-Box über alle Targets — bestimmt die Karten-Position.
  const union = hasRects ? rects.reduce(
    (acc, r) => ({
      top: Math.min(acc.top, r.top),
      bottom: Math.max(acc.bottom, r.bottom),
    }),
    { top: Infinity, bottom: -Infinity },
  ) : null;

  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const cardAtTop = !!union && (union.top + union.bottom) / 2 > vh / 2;
  const cardStyle: React.CSSProperties = hasRects
    ? cardAtTop
      ? { top: 24, left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 100, left: '50%', transform: 'translateX(-50%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={clsx('fixed inset-0 z-[2147483646]', !hasRects && 'bg-black/65 backdrop-blur-[1px]')}>
      {/* Dim-Layer mit Cutouts pro Target via SVG-Maske */}
      {hasRects && (
        <svg className="fixed inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {rects.map((r, idx) => (
                <rect
                  key={idx}
                  x={r.left - PAD}
                  y={r.top - PAD}
                  width={r.width + PAD * 2}
                  height={r.height + PAD * 2}
                  rx={RADIUS}
                  ry={RADIUS}
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#tour-spotlight-mask)" />
        </svg>
      )}

      {/* Glühende Goldringe pro Target */}
      {rects.map((r, idx) => (
        <div
          key={idx}
          className="fixed pointer-events-none rounded-2xl"
          style={{
            top: r.top - PAD,
            left: r.left - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
            boxShadow:
              '0 0 0 3px rgba(230,180,60,0.95), 0 0 30px rgba(230,180,60,0.7)',
            animation: 'auraGlow 2s ease-in-out infinite',
          }}
        />
      ))}

      {/* Karte */}
      <div className="fixed z-[2147483647] w-[calc(100%-32px)] max-w-[330px]" style={cardStyle}>
        <div className="bg-card border border-border rounded-[24px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, idx) => (
              <div key={idx} className={clsx(
                'h-1.5 rounded-full transition-all duration-300',
                idx === i ? 'w-7 bg-gradient-to-r from-blue to-purple'
                  : idx < i ? 'w-3.5 bg-green/60'
                  : 'w-3.5 bg-border',
              )} />
            ))}
            <span className="font-mono text-[9px] text-muted tracking-[0.1em] ml-1">{i + 1}/{STEPS.length}</span>
          </div>

          <div className="text-[20px] font-black text-white mb-2 leading-tight">{step.title}</div>
          <div className="text-[13px] text-muted leading-relaxed mb-3">{step.body}</div>

          <div className="flex gap-3 mt-2">
            <button onClick={onDone}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold text-muted bg-white/5 border border-white/10 hover:text-white transition-colors cursor-pointer">
              Überspringen
            </button>
            <button onClick={next}
              className="flex-1 py-3 rounded-xl text-[14px] font-black text-bg bg-gradient-to-r from-green to-[#B8860B] shadow-[0_4px_18px_rgba(230,180,60,0.3)] transition-all cursor-pointer">
              {last ? "Los geht's!" : 'Weiter →'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
