import { useState } from 'react';
import { clsx } from 'clsx';

interface Step {
  title: string;
  body: string;
  cue?: string; // kleiner Richtungs-/Orts-Hinweis (z. B. "↑ Oben")
}

const STEPS: Step[] = [
  {
    title: 'Willkommen, Prophet! 🍺',
    body: 'Du startest mit 1.000 Token. Auf dem Dashboard siehst du den Jackpot — das ist der gemeinsame Topf. Wenn du richtig tippst, teilst du den Topf mit den anderen Gewinnern. Tipp: Nicht alles auf den klaren Favoriten setzen — du gewinnst dann fast nichts.',
    cue: '↑ Jackpot oben am Dashboard',
  },
  {
    title: 'Wo wird getippt?',
    body: 'WM-Spiele tippst du im Tab „Spielplan" — unten in der Leiste. Sonderwetten und Gratis-Runden findest du hier im Dashboard. Wichtig: Jedes offene Spiel muss getippt werden, sonst kostet es Token.',
    cue: '↓ Tabs unten · „Spielplan"',
  },
  {
    title: 'Hilfe & Tipps',
    body: 'Den Hilfe-Bereich erreichst du über das Buch-Symbol oben. Dort findest du alle Regeln, einen eigenen Tipps-Bereich für Anfänger und bald auch eine kurze Audio-Erklärung. Wenn du unsicher bist — einfach reinschauen.',
    cue: '📖 Buch-Symbol oben',
  },
  {
    title: 'Dein Profil',
    body: 'Tippe auf deinen Charakter in der Mitte — dort siehst du deine Statistiken, kannst Accessoires anziehen und dein Passwort ändern. In der Rangliste kannst du übrigens auch jeden anderen Spieler antippen. Viel Glück! 🏆',
    cue: '⌖ Charakter in der Mitte',
  },
];

interface Props { onDone: () => void; }

// Kleine Einsteiger-Tour, einmalig beim ersten Dashboard-Aufruf.
// Reines Overlay (keine DOM-Highlights) → robust auf jedem Gerät.
export default function OnboardingTour({ onDone }: Props) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5">
      <div className="bg-card border border-border rounded-[24px] w-full max-w-[330px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
        {/* Fortschrittspunkte */}
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
        {step.cue && (
          <div className="text-[11px] font-black text-yellow bg-yellow/10 border border-yellow/25 rounded-lg px-2.5 py-1.5 mb-4 inline-block">
            {step.cue}
          </div>
        )}

        <div className="flex gap-3 mt-1">
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
  );
}
