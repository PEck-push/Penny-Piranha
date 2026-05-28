import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface Step {
  title: string;
  body: string;
  /** data-tour-Attribut des hervorzuhebenden Elements (optional). */
  target?: string;
}

const STEPS: Step[] = [
  {
    // Reine Erklärung, kein Element-Highlight.
    title: 'Willkommen, Prophet! 🍺',
    body: 'Du startest mit 1.000 Token. Der Jackpot ist vor allem die Preiskasse für die Gratis-Sonderwetten — das Geld kommt aus der Hausbank. Liegt bei einer normalen Wette niemand richtig, fließt der Pool zusätzlich in den Jackpot.',
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

// Spotlight-Coachmark-Tour: highlightet das jeweils thematisierte Element per
// Goldring + dunklem Umfeld (CSS box-shadow-Trick). Schritte ohne target zeigen
// nur die zentrierte Karte mit dunklem Backdrop.
export default function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));

  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step.target) { setRect(null); return; }
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(el ? (el as HTMLElement).getBoundingClientRect() : null);
    };
    // Mini-Delay, damit das Target sicher gerendert ist (z. B. nach Tab-Wechsel)
    const t = setTimeout(find, 50);
    window.addEventListener('resize', find);
    return () => { clearTimeout(t); window.removeEventListener('resize', find); };
  }, [i, step.target]);

  // Karten-Position: gegenüber des Targets, damit es nicht verdeckt wird.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const cardAtTop = !!rect && rect.top + rect.height / 2 > vh / 2;
  const cardStyle: React.CSSProperties = rect
    ? cardAtTop
      ? { top: 24, left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 100, left: '50%', transform: 'translateX(-50%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className={clsx('fixed inset-0 z-[200]', !rect && 'bg-black/65 backdrop-blur-[1px]')}>
      {/* Spotlight-Ring + Dim außenrum via box-shadow-Trick */}
      {rect && (
        <div
          className="fixed pointer-events-none z-[210] rounded-2xl"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            boxShadow:
              '0 0 0 3px rgba(230,180,60,0.95), 0 0 30px rgba(230,180,60,0.7), 0 0 0 9999px rgba(0,0,0,0.7)',
            animation: 'auraGlow 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Karte */}
      <div className="fixed z-[220] w-[calc(100%-32px)] max-w-[330px]" style={cardStyle}>
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
    </div>
  );
}
