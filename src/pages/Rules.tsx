import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';

const SECTIONS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🎯',
    title: 'Worum geht es?',
    body: 'Die Propheten tippen auf WM-Ereignisse. Wer richtig liegt, gewinnt Token. Am Ende des Turniers zählt, wer das größte Vermögen erprophezeit hat.',
  },
  {
    icon: '💰',
    title: 'Wie gewinnt man Token?',
    body: 'Tipp auf einen offenen Markt, wähle deinen Einsatz — und recht behalten. Bei richtiger Prognose erhältst du deinen proportionalen Anteil aus dem Gesamttopf. Je mehr du einsetzt und je weniger andere auf dasselbe Ergebnis tippen, desto höher dein Gewinn. Liegt niemand richtig, wandert der gesamte Topf in den Jackpot.',
  },
  {
    icon: '⚖️',
    title: 'Auszahlung im Detail (Parimutuel)',
    body: 'Alle Einsätze fließen in einen gemeinsamen Topf. Die richtigen Tipper teilen ihn im Verhältnis ihres Einsatzes zueinander. Beispiel: Topf 300 TKN, du hast 60 von 100 TKN auf den Sieger gesetzt → du bekommst 180 TKN (60 % von 300). Mindestgewinn: Einsatz + 2 Token.',
  },
  {
    icon: '💪',
    title: 'Underdog-Bonus',
    body: 'Wer auf einen Außenseiter tippt — eine Option mit unter 15 % Anteil am Gesamttopf zum Zeitpunkt der Markt-Sperrung — kassiert bei einem Treffer zusätzlich 10 % seines Einsatzes als Bonus aus der Hausbank. Mut wird belohnt!',
  },
  {
    icon: '▶️',
    title: 'Wetten platzieren & ändern',
    body: 'Wähle bei einem offenen Markt eine Antwort und setze Token. Bis zum Anpfiff bzw. zur Markt-Sperrung kannst du deine Wette jederzeit anpassen. Danach ist sie fix.',
  },
  {
    icon: '⚡',
    title: 'Tipp-Pflicht & Strafe',
    body: 'Jeder offene Markt muss vor der Sperrung getippt werden. Wer einen Markt ungetippt lässt, wird automatisch mit dem jeweils festgelegten Strafbetrag belastet — diese Token wandern direkt in den Jackpot. Rechtzeitig tippen lohnt sich also doppelt!',
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
    icon: '⚠️',
    title: 'Überlebensmodus',
    body: 'Wer unter 25 Token fällt, aktiviert den Überlebensmodus. Wetten sind weiterhin möglich — aber das Polster ist fast weg. In diesem Zustand kann ein Buyback beim Admin beantragt werden.',
  },
  {
    icon: '🔄',
    title: 'Buyback — zweite Chance',
    body: 'Im Überlebensmodus (unter 25 Token) kann man einmalig einen Buyback beantragen. Der Admin genehmigt ihn: du bekommst 800 Token auf dein aktuelles Guthaben obendrauf. Diese Joker-Option gibt es nur einmal pro Spieler und nur bis Ende des Achtelfinals.',
  },
  {
    icon: '💀',
    title: 'Bankrott & Ausscheiden',
    body: 'Erst bei exakt 0 Token ist man wirklich draußen — keine Wetten mehr möglich, offiziell aus dem Bewerb ausgeschieden. Gratis-Tipps der Jackpot-Sonderrunden können aber weiterhin abgegeben werden.',
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

// ── Strategie-Tipps (speziell zum Parimutuel-System, für Einsteiger) ──────────
const TIPS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🧠',
    title: 'Erst das System verstehen: der gemeinsame Topf',
    body: 'Du spielst NICHT gegen feste Quoten wie beim Wettbüro. Alle Einsätze eines Marktes landen in EINEM Topf, und die richtigen Tipper teilen ihn im Verhältnis ihrer Einsätze. Heißt: Dein Gewinn hängt davon ab, wie viele andere dasselbe tippen — nicht nur davon, ob du recht hast.',
  },
  {
    icon: '🚫',
    title: 'Der Anfänger-Fehler Nr. 1: viel auf den klaren Favoriten',
    body: 'Beispiel Deutschland – Curaçao: 9 von 10 tippen auf Deutschland. Setzt du 100 Token auf Deutschland und Deutschland gewinnt, teilen sich fast alle den Topf — du bekommst vielleicht 105 zurück (+5). Patzt Deutschland aber doch, sind deine 100 Token weg. 100 riskieren für +5 ist ein mieser Deal.',
  },
  {
    icon: '⚖️',
    title: 'Risiko vs. Ertrag — immer abwägen',
    body: 'Faustregel: Je klarer der Ausgang, desto kleiner der mögliche Gewinn pro Token — aber das Verlustrisiko bleibt voll. Auf „todsichere" Spiele gehört nur der Mindesteinsatz. Hohe Beträge nur, wenn der mögliche Gewinn das Risiko wirklich rechtfertigt.',
  },
  {
    icon: '💎',
    title: 'Wo das echte Geld liegt: enge Spiele & Außenseiter',
    body: 'Ausgeglichene Spiele (Topf gut verteilt) zahlen pro Token deutlich mehr. Und: Tippst du einen Außenseiter (unter 15 % des Topfes) richtig, gibt es zusätzlich den Underdog-Bonus. Genau hier macht man Plätze gut — nicht bei Deutschland – Curaçao.',
  },
  {
    icon: '🍳',
    title: 'Nicht alle Eier in einen Korb',
    body: 'Verteile deine Token über mehrere Spiele, statt alles auf eines zu setzen. Ein einziger Fehltipp soll dich nicht aus dem Rennen werfen. Konstanz schlägt das große Zocken — vor allem in der Gruppenphase.',
  },
  {
    icon: '⚡',
    title: 'Pflicht-Tipp: lieber klein als gar nicht',
    body: 'Jedes offene Spiel MUSS getippt werden. Wer nicht tippt, zahlt automatisch den Strafbetrag in den Jackpot — geschenkt. Selbst wenn du unsicher bist: der Mindesteinsatz ist immer besser als die Strafe fürs Nicht-Tippen.',
  },
  {
    icon: '🎟️',
    title: 'Spar dir Pulver für die K.-o.-Phase',
    body: 'In der Gruppenphase ist der Maximaleinsatz bewusst niedrig (100 Token) — damit niemand sich früh selbst zerlegt. In den K.-o.-Runden steigen die Limits deutlich. Wer mit Polster reinkommt, kann dort die großen Schritte machen.',
  },
  {
    icon: '🎰',
    title: 'Gratis-Runden immer mitnehmen',
    body: 'Die Jackpot-Sonderrunden (inkl. Österreich) kosten keinen Einsatz — nur Gewinnchance, kein Risiko. Lass nie eine aus.',
  },
];

export default function Rules() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'regeln' | 'tipps'>('regeln');
  const items = tab === 'tipps' ? TIPS : SECTIONS;

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

      {/* Tab-Umschalter */}
      <div className="relative z-10 flex gap-1.5 px-4 mb-3 shrink-0">
        {([['regeln', '📜 Regeln'], ['tipps', '💡 Tipps']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={clsx('flex-1 py-2.5 rounded-xl text-[12px] font-black transition-all border',
              tab === id ? 'bg-white/10 text-white border-white/15' : 'text-muted border-transparent hover:text-white')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'tipps' && (
        <div className="relative z-10 px-4 mb-1">
          <div className="bg-yellow/10 border border-yellow/25 rounded-2xl p-3 text-[12px] text-yellow/90 leading-relaxed">
            ⚽ <b>Neu im Spiel?</b> Diese Tipps erklären, wie man im gemeinsamen Topf (Parimutuel) klug setzt — und typische Anfängerfehler vermeidet.
          </div>
        </div>
      )}

      {/* Sections / Tipps */}
      <div className="relative z-10 flex flex-col gap-2.5 px-4 pb-10">
        {items.map((s, i) => (
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
