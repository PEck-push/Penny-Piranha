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
    body: 'WM-Spiele tippst du im Tab „Spielplan" — oder bequem im Tab „Wetten", wo alle offenen Spiele für dich aufgelistet sind. Wichtig: Jedes offene Spiel muss getippt werden, sonst kostet es Token.',
    target: ['tab-spielplan', 'tab-wetten'],
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
// Bottom-Nav schirmt sich selbst ab — Karte nicht dort hineinpositionieren.
const NAV_RESERVE = 90;
// Zwei Rects gelten als „nebeneinander" und werden zu EINEM Highlight-Ring
// gemerged, wenn sie sich beruehren oder weniger als MERGE_GAP_PX trennen.
// Verhindert die ueberlappenden Ringe bei zwei adjacent Tabs.
const MERGE_GAP_PX = 12;

interface SimpleRect { top: number; left: number; width: number; height: number; bottom: number; right: number; }

// Naheliegende Rects zu einem Bounding-Rect zusammenfassen. Geht in einem
// Pass durch die nach top sortierten Rects und merget jedes, das sich
// horizontal UND vertikal mit dem aktuellen Cluster ueberschneidet/anstoesst.
function mergeRects(rects: DOMRect[]): SimpleRect[] {
  if (rects.length <= 1) {
    return rects.map(r => ({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }));
  }
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: SimpleRect[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    const closeVert = last && r.top - last.bottom <= MERGE_GAP_PX;
    const overlapsHoriz = last && !(r.right < last.left - MERGE_GAP_PX || r.left > last.right + MERGE_GAP_PX);
    if (last && closeVert && overlapsHoriz) {
      const left = Math.min(last.left, r.left);
      const top = Math.min(last.top, r.top);
      const right = Math.max(last.right, r.right);
      const bottom = Math.max(last.bottom, r.bottom);
      merged[merged.length - 1] = { left, top, right, bottom, width: right - left, height: bottom - top };
    } else {
      merged.push({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right });
    }
  }
  return merged;
}

// Sucht den groessten freien vertikalen Korridor zwischen den Targets (oder
// zwischen Bildschirm-Rand und naechstem Target). Liefert {top, bottom} des
// Korridors. NAV_RESERVE wird vom Bildschirm-Boden abgezogen, damit die Karte
// nicht hinter der Bottom-Nav verschwindet.
function findBiggestGap(rects: SimpleRect[], vh: number): { top: number; bottom: number } | null {
  if (rects.length === 0) return null;
  const sorted = [...rects].sort((a, b) => a.top - b.top);
  const usableBottom = vh - NAV_RESERVE;
  const gaps: { top: number; bottom: number }[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.top - cursor > 24) gaps.push({ top: cursor, bottom: r.top });
    cursor = Math.max(cursor, r.bottom);
  }
  if (usableBottom - cursor > 24) gaps.push({ top: cursor, bottom: usableBottom });
  if (gaps.length === 0) return null;
  return gaps.reduce((a, b) => (b.bottom - b.top > a.bottom - a.top ? b : a));
}

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

  // Adjacent / sich beruehrende Rects (z. B. zwei Bottom-Nav-Tabs nebeneinander)
  // zu einem Ring zusammenfassen — sonst entstehen sich ueberlappende Ringe.
  const mergedRects = mergeRects(rects);
  const hasRects = mergedRects.length > 0;

  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  // Karte in den groessten freien Korridor zwischen den Targets legen, statt
  // pauschal oben/unten zu kleben. Dadurch landet sie nicht ueber dem Element,
  // das sie eigentlich beschreibt.
  const gap = hasRects ? findBiggestGap(mergedRects, vh) : null;
  const cardStyle: React.CSSProperties = gap
    ? { top: gap.top + Math.max(8, (gap.bottom - gap.top) * 0.05), left: '50%', transform: 'translateX(-50%)' }
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
              {mergedRects.map((r, idx) => (
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

      {/* Glühende Goldringe pro Target-Cluster (gemerged) */}
      {mergedRects.map((r, idx) => (
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
