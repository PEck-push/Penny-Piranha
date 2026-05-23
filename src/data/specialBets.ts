// Vorlagen für Spezialwetten (Plan §5). Der Admin erstellt sie per Klick.
// austria: true → erscheint im Österreich-Block.

export interface SpecialBetTemplate {
  id: string;
  title: string;
  options: string[];
  austria?: boolean;
}

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
