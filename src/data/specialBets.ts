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
  block?: 'block1' | 'block2' | 'finale';
  fixedPrize?: number;
  absorbsJackpotPot?: boolean;
}

// Anzeige-Label je Jackpot-Block.
export const JACKPOT_BLOCK_LABELS: Record<string, string> = {
  block1: '🏁 Block 1 — Ende Gruppenphase',
  block2: '🥊 Block 2 — Ende Sechzehntel-/Achtelfinale',
  finale: '🏆 Finale-Jackpot',
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

export const AUSTRIA_SPECIALS: SpecialBetTemplate[] = [
  {
    id: 'aut-progress',
    title: '🇦🇹 Wie weit kommt Österreich?',
    options: ['Gruppenphase', 'Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale', 'Weltmeister'],
    austria: true,
  },
  {
    id: 'aut-goals',
    title: '🇦🇹 Wie viele Tore schießt Österreich in der Gruppenphase?',
    options: ['0', '1', '2', '3', '4', '5', '6+'],
    austria: true,
  },
  {
    id: 'aut-points',
    title: '🇦🇹 Wie viele Punkte holt Österreich in der Gruppenphase?',
    options: ['0', '1', '3', '4', '6', '7', '9'],
    austria: true,
  },
  {
    id: 'aut-arnautovic',
    title: '🇦🇹 Trifft Marko Arnautović im Turnier?',
    options: ['JA', 'NEIN'],
    austria: true,
  },
];

export const ALL_SPECIALS = [...INTERNATIONAL_SPECIALS, ...AUSTRIA_SPECIALS];

// ── Jackpot-Sonderrunden (einsatzfrei, fester Haus-Preis) ──────────────────────
// Mehrere Blöcke, zeitlich über das Turnier verteilt. Korrekte Tipper teilen den
// fixedPrize gleichmäßig. Die Finale-Headline (worldchampion) absorbiert zusätzlich
// den über das Turnier angesparten jackpot.
export const JACKPOT_TEMPLATES: SpecialBetTemplate[] = [
  // Block 1 — Ende Gruppenphase
  {
    id: 'jp-group-goals',
    title: '🥅 Wie viele Tore fallen in der Gruppenphase?',
    options: ['unter 160', '160–179', '180–199', '200–219', '220+'],
    block: 'block1', fixedPrize: 200,
  },
  {
    id: 'jp-aut-goals',
    title: '🇦🇹 Wie viele Tore schießt Österreich in der Gruppenphase?',
    options: ['0', '1', '2', '3', '4', '5', '6+'],
    block: 'block1', fixedPrize: 200,
  },
  {
    id: 'jp-aut-points',
    title: '🇦🇹 Wie viele Punkte holt Österreich in der Gruppenphase?',
    options: ['0', '1', '3', '4', '6', '7', '9'],
    block: 'block1', fixedPrize: 200,
  },
  // Block 2 — Ende Sechzehntel-/Achtelfinale
  {
    id: 'jp-penalties',
    title: '🎯 Wie viele Sechzehntelfinale gehen ins Elfmeterschießen?',
    options: ['0', '1', '2', '3', '4+'],
    block: 'block2', fixedPrize: 300,
  },
  {
    id: 'jp-surprise-out',
    title: '😱 Welcher Topfavorit scheidet zuerst aus?',
    options: ['Brasilien', 'Frankreich', 'England', 'Deutschland', 'Spanien', 'Portugal', 'Argentinien', 'Keiner'],
    block: 'block2', fixedPrize: 300,
  },
  {
    id: 'jp-aut-progress',
    title: '🇦🇹 Wie weit kommt Österreich?',
    options: ['Gruppenphase', 'Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale', 'Weltmeister'],
    block: 'block2', fixedPrize: 300,
  },
  // Finale-Jackpot — klassische Tipps, großer Showdown
  {
    id: 'jp-worldchampion',
    title: '🏆 Wer wird Weltmeister?',
    options: ['Brasilien', 'Frankreich', 'England', 'Spanien', 'Argentinien', 'Deutschland', 'Portugal', 'Andere'],
    block: 'finale', fixedPrize: 400, absorbsJackpotPot: true,
  },
  {
    id: 'jp-topscorer',
    title: '⚽ Wer wird Torschützenkönig?',
    options: ['Mbappé', 'Haaland', 'Kane', 'Vinícius Jr.', 'Lautaro Martínez', 'Andere'],
    block: 'finale', fixedPrize: 400,
  },
  {
    id: 'jp-goldenball',
    title: '🥇 Wer gewinnt den Goldenen Ball?',
    options: ['Mbappé', 'Bellingham', 'Vinícius Jr.', 'Messi', 'Yamal', 'Andere'],
    block: 'finale', fixedPrize: 400,
  },
  {
    id: 'jp-total-goals',
    title: '🌍 Wie viele Tore fallen im gesamten Turnier?',
    options: ['unter 240', '240–269', '270–299', '300–329', '330+'],
    block: 'finale', fixedPrize: 400,
  },
];
