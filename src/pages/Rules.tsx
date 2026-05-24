import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const SECTIONS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🎯',
    title: 'Worum geht es?',
    body: 'Die Propheten tippen auf WM-Ereignisse. Wer richtig liegt, gewinnt Token. Am Ende des Turniers zählt, wer das größte Vermögen erprophezeit hat.',
  },
  {
    icon: '🪙',
    title: 'Token',
    body: 'Jeder startet mit einem Guthaben. „Frei" sind die Token, die du gerade einsetzen kannst, „Konto" ist dein Gesamtvermögen inkl. laufender Wetten.',
  },
  {
    icon: '▶️',
    title: 'Wetten platzieren',
    body: 'Wähle bei einem offenen Markt eine Antwort und setze Token. Du kannst deine Wette bis zum Anpfiff jederzeit ändern. Danach wird der Markt gesperrt.',
  },
  {
    icon: '⚖️',
    title: 'Auszahlung (Parimutuel)',
    body: 'Alle Einsätze eines Marktes wandern in einen Topf. Nach dem Ergebnis teilen die richtigen Tipper den gesamten Topf — je mehr Einsatz, desto größer dein Anteil. Liegt niemand richtig, wandert der Topf in den Jackpot.',
  },
  {
    icon: '🎰',
    title: 'Jackpot-Sonderrunden',
    body: 'Über das Turnier verteilt gibt es einsatzfreie Gratis-Tipps. Das Haus stiftet pro Frage einen festen Preis, den die richtigen Tipper gleichmäßig teilen. Kein Risiko — nur Gewinn.',
  },
  {
    icon: '🇦🇹',
    title: 'Österreich-Jackpot',
    body: 'Ein eigener Sonderblock dreht sich nur um das ÖFB-Team. Gleiche Gratis-Regeln, eigener Preistopf — für alle Patrioten unter den Propheten.',
  },
  {
    icon: '💀',
    title: 'Ausscheiden',
    body: 'Wer auf unter 25 Token fällt, ist zahlungsunfähig und kann keine neuen Wetten mehr abgeben. Ohne Buyback scheidet man offiziell aus dem Bewerb aus — bleibt aber als stiller Beobachter dabei.',
  },
  {
    icon: '🔄',
    title: 'Buyback — zweite Chance',
    body: 'Wer zahlungsunfähig ist und noch keinen Buyback genutzt hat, kann einmalig eine zweite Chance beantragen. Der Admin genehmigt sie: du erhältst 800 Token obendrauf und bist wieder voll dabei. Diese Joker-Option gibt es nur einmal pro Spieler und nur bis Ende des Achtelfinals.',
  },
  {
    icon: '🔥',
    title: 'Serien & Erfolge',
    body: 'Mehrere richtige Tipps in Folge bringen dich „On Fire". Für besondere Leistungen schaltest du Abzeichen frei, die dein Profil schmücken.',
  },
  {
    icon: '🏆',
    title: 'Rangliste',
    body: 'Die Bestenliste sortiert alle Propheten nach Gesamtvermögen. Tippe klug, sammle Token und arbeite dich an die Spitze.',
  },
];

export default function Rules() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col bg-bg relative overflow-y-auto no-scrollbar">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(139,61,255,.3)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(230,180,60,.14)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(59,110,255,.18)_0%,transparent_50%)]" />

      {/* Header */}
      <div className="relative z-10 px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/dashboard')}
          className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[17px] font-black text-white">Spielregeln</span>
      </div>

      {/* Intro */}
      <div className="relative z-10 flex flex-col items-center pt-3 pb-4 shrink-0 px-6 text-center">
        <img src="/logo-icon.webp" alt="" className="h-16 w-16 object-contain mb-2"
          style={{ animation: 'auraGlow 4s ease-in-out infinite' }} />
        <div className="text-[13px] text-muted leading-relaxed">
          So funktioniert das WM-Tippspiel der <b className="text-white">Krügerl Propheten</b> — kurz & bündig.
        </div>
      </div>

      {/* Sections */}
      <div className="relative z-10 flex flex-col gap-2.5 px-4 pb-10">
        {SECTIONS.map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-[18px] shrink-0">
              {s.icon}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[14px] font-black text-white">{s.title}</div>
              <div className="text-[12px] text-muted leading-relaxed">{s.body}</div>
            </div>
          </div>
        ))}

        <div className="text-center text-[11px] text-muted/70 font-mono tracking-wider uppercase mt-3">
          ✦ Möge der beste Prophet gewinnen ✦
        </div>
      </div>
    </div>
  );
}
