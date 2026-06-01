// Vorlagen für Spezialwetten (Plan §5). Der Admin erstellt sie per Klick.
// austria: true → erscheint im Österreich-Block.

export interface SpecialBetTemplate {
  id: string;
  title: string;
  options: string[];
  austria?: boolean;
  // Jackpot-Sonderrunden (einsatzfrei): zu welchem Block die Frage gehört,
  // welcher feste Token-Preis vergeben wird und ob sie den angesparten
  // jackpot zusätzlich absorbiert (nur Finale-Headline).
  block?: 'block1' | 'austria' | 'block2' | 'finale';
  fixedPrize?: number;
  absorbsJackpotPot?: boolean;
}

// Anzeige-Label je Jackpot-Block.
export const JACKPOT_BLOCK_LABELS: Record<string, string> = {
  block1: '🏁 Block 1 — Ende Gruppenphase',
  austria: '🇦🇹 Österreich-Jackpot',
  block2: '🥊 Block 2 — Ende Sechzehntel-/Achtelfinale',
  finale: '🏆 Finale-Jackpot',
  special: '⭐ Special',
};

export const INTERNATIONAL_SPECIALS: SpecialBetTemplate[] = [
  {
    id: 'topscorer',
    title: '⚽ Wer wird Torschützenkönig?',
    options: ['Mbappé', 'Haaland', 'Kane', 'Vinícius Jr.', 'Lautaro Martínez', 'Andere'],
  },
  {
    id: 'goldenball',
    title: '🏆 Wer gewinnt den Goldenen Ball?',
    options: ['Mbappé', 'Bellingham', 'Vinícius Jr.', 'Messi', 'Yamal', 'Andere'],
  },
  {
    id: 'surprise-out',
    title: '😱 Welcher Topfavorit scheidet zuerst aus?',
    options: ['Brasilien', 'Frankreich', 'England', 'Deutschland', 'Spanien', 'Portugal', 'Argentinien', 'Keiner'],
  },
  {
    id: 'milestone-group-goals',
    title: '🥅 Wie viele Tore fallen in der Gruppenphase?',
    options: ['unter 160', '160–179', '180–199', '200–219', '220+'],
  },
  {
    id: 'milestone-penalties',
    title: '🎯 Wie viele Sechzehntelfinale gehen ins Elfmeterschießen?',
    options: ['0', '1', '2', '3', '4+'],
  },
  {
    id: 'milestone-total-goals',
    title: '🌍 Wie viele Tore fallen im gesamten Turnier?',
    options: ['unter 240', '240–269', '270–299', '300–329', '330+'],
  },
];

// ── Jackpot-Sonderrunden (einsatzfrei, fester Haus-Preis) ──────────────────────
// Mehrere Blöcke, zeitlich über das Turnier verteilt. Korrekte Tipper teilen den
// fixedPrize gleichmäßig. Die Finale-Headline (worldchampion) absorbiert zusätzlich
// den über das Turnier angesparten jackpot (recyceltes, verfallenes Einsatzgeld —
// zählt NICHT zum 2500-Budget).
//
// ── Preis-Design (Game-Design-Logik) ──────────────────────────────────────────
// Gesamtbudget = 3000 TKN, wenn ein Spieler ALLE Fragen richtig tippt (sehr
// unwahrscheinlich). Höhe je Frage skaliert mit:
//   • Schwierigkeit  → mehr Optionen = geringere Trefferchance = höherer Preis
//   • Dramaturgie    → Block 1 < Block 2 < Finale (Spannungsbogen)
//   • Österreich     → eigener Sonderblock, höher dotiert als der Einstieg (Block 1)
// Vier Blöcke: Block 1 = 350, 🇦🇹 Österreich = 750, Block 2 = 600, Finale = 1300 (Σ 3000).
export const JACKPOT_TEMPLATES: SpecialBetTemplate[] = [
  // Block 1 — Ende Gruppenphase (Einstieg) · Σ 350
  {
    id: 'jp-group-goals',
    title: '🥅 Wie viele Tore fallen in der Gruppenphase?',
    options: ['unter 160', '160–179', '180–199', '200–219', '220+'],
    block: 'block1', fixedPrize: 350, // 5 Opt., international
  },
  // 🇦🇹 Österreich-Jackpot — eigener Sonderblock · Σ 750
  {
    id: 'jp-aut-goals',
    title: '🇦🇹 Wie viele Tore schießt Österreich in der Gruppenphase?',
    options: ['0', '1', '2', '3', '4', '5', '6+'],
    block: 'austria', fixedPrize: 250, // 7 Opt., AT-Bonus
  },
  {
    id: 'jp-aut-points',
    title: '🇦🇹 Wie viele Punkte holt Österreich in der Gruppenphase?',
    options: ['0', '1', '3', '4', '6', '7', '9'],
    block: 'austria', fixedPrize: 150, // 7 Opt., AT-Bonus
  },
  {
    id: 'jp-aut-progress',
    title: '🇦🇹 Wie weit kommt Österreich?',
    options: ['Gruppenphase', 'Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale', 'Weltmeister'],
    block: 'austria', fixedPrize: 250, // 7 Opt., AT-Bonus, dramatischster AT-Tipp
  },
  {
    id: 'jp-aut-arnautovic',
    title: '🇦🇹 Trifft Marko Arnautović im Turnier?',
    options: ['JA', 'NEIN'],
    block: 'austria', fixedPrize: 100, // 2 Opt., leichter Bonus-Tipp
  },
  // Block 2 — Ende Sechzehntel-/Achtelfinale (mittlere Preise) · Σ 600
  {
    id: 'jp-penalties',
    title: '🎯 Wie viele Sechzehntelfinale gehen ins Elfmeterschießen?',
    options: ['0', '1', '2', '3', '4+'],
    block: 'block2', fixedPrize: 250, // 5 Opt.
  },
  {
    id: 'jp-surprise-out',
    title: '😱 Welcher Topfavorit scheidet zuerst aus?',
    options: ['Brasilien', 'Frankreich', 'England', 'Deutschland', 'Spanien', 'Portugal', 'Argentinien', 'Keiner'],
    block: 'block2', fixedPrize: 350, // 8 Opt., schwer
  },
  // Finale-Jackpot — klassische Tipps, großer Showdown (größte Preise) · Σ 1300
  {
    id: 'jp-worldchampion',
    title: '🏆 Wer wird Weltmeister?',
    options: ['Brasilien', 'Frankreich', 'England', 'Spanien', 'Argentinien', 'Deutschland', 'Portugal', 'Andere'],
    block: 'finale', fixedPrize: 400, absorbsJackpotPot: true, // Headline, 8 Opt. + angesparter Pot
  },
  {
    id: 'jp-topscorer',
    title: '⚽ Wer wird Torschützenkönig?',
    options: ['Mbappé', 'Haaland', 'Kane', 'Vinícius Jr.', 'Lautaro Martínez', 'Andere'],
    block: 'finale', fixedPrize: 300, // 6 Opt.
  },
  {
    id: 'jp-goldenball',
    title: '🥇 Wer gewinnt den Goldenen Ball?',
    options: ['Mbappé', 'Olise', 'Kane', 'Vinícius Jr.', 'Messi', 'Yamal', 'Andere'],
    block: 'finale', fixedPrize: 300, // 7 Opt.
  },
  {
    id: 'jp-total-goals',
    title: '🌍 Wie viele Tore fallen im gesamten Turnier?',
    options: ['unter 240', '240–269', '270–299', '300–329', '330+'],
    block: 'finale', fixedPrize: 300, // 5 Opt.
  },
];

// Summe aller fixedPrize (= maximale Jackpot-Ausschüttung bei allen Treffern).
export const JACKPOT_TOTAL_BUDGET = JACKPOT_TEMPLATES.reduce((s, t) => s + (t.fixedPrize ?? 0), 0); // 3000
