import type { Phase } from '../utils/phase';

export interface WmMatch {
  matchId: string; // "A1", "A2", ... "L6"
  phase: Phase;
  groupLabel: string; // "Gruppe A"
  teamA: string;
  teamB: string;
  kickoffAt: number; // UTC milliseconds
  matchday: 1 | 2 | 3;
}

// WM 2026 (USA / Kanada / Mexiko), 11. Juni – 19. Juli 2026.
// 48 Teams, 12 Gruppen (A–L) à 4 Teams = 72 Gruppenspiele.
//
// HINWEIS: Die echte Gruppenauslosung findet erst statt — die Teamnamen hier
// sind realistische Platzhalter (Gastgeber + wahrscheinliche Qualifikanten).
// Der Admin aktualisiert Teams + Anstoßzeiten sobald die Auslosung feststeht.
// Österreich ist bewusst in Gruppe C platziert (Österreich-Spezialwetten).
const GROUPS: Record<string, [string, string, string, string]> = {
  A: ['Mexiko', 'Polen', 'Südkorea', 'Katar'],
  B: ['Kanada', 'Belgien', 'Ägypten', 'Neuseeland'],
  C: ['USA', 'Österreich', 'Uruguay', 'Saudi-Arabien'],
  D: ['Argentinien', 'Kroatien', 'Nigeria', 'Panama'],
  E: ['Frankreich', 'Senegal', 'Iran', 'Honduras'],
  F: ['Brasilien', 'Schweiz', 'Kamerun', 'Jordanien'],
  G: ['England', 'Niederlande', 'Ghana', 'Curacao'],
  H: ['Spanien', 'Japan', 'Marokko', 'Costa Rica'],
  I: ['Deutschland', 'Kolumbien', 'Australien', 'Usbekistan'],
  J: ['Portugal', 'Mexiko B', 'Elfenbeinküste', 'Kap Verde'],
  K: ['Italien', 'Ecuador', 'Tunesien', 'Jamaika'],
  L: ['Niederlande B', 'USA B', 'Algerien', 'Bolivien'],
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Eröffnungstag: 11. Juni 2026, erstes Spiel 19:00 ET = 23:00 UTC.
const TOURNAMENT_START_UTC = Date.UTC(2026, 5, 11, 23, 0, 0);

// Standard-Round-Robin für 4 Teams (Indizes 0–3) → 6 Paarungen über 3 Spieltage.
const PAIRINGS: { md: 1 | 2 | 3; a: number; b: number }[] = [
  { md: 1, a: 0, b: 1 },
  { md: 1, a: 2, b: 3 },
  { md: 2, a: 0, b: 2 },
  { md: 2, a: 3, b: 1 },
  { md: 3, a: 3, b: 0 },
  { md: 3, a: 1, b: 2 },
];

const buildSchedule = (): WmMatch[] => {
  const groupKeys = Object.keys(GROUPS);
  const matches: WmMatch[] = [];

  groupKeys.forEach((g, groupIdx) => {
    const teams = GROUPS[g];
    PAIRINGS.forEach((p, pairIdx) => {
      // Spieltag-Offset: MD1 ab Tag 0, MD2 ab Tag 5, MD3 ab Tag 10.
      // Gruppen gestaffelt über je ~2 Gruppen pro Tag, 2 Anstoßzeiten täglich.
      const mdBaseDay = (p.md - 1) * 5;
      const dayWithinMd = Math.floor(groupIdx / 2);
      const slotInDay = (groupIdx % 2) * 3 + (pairIdx % 2); // 0..3 → 18/21 Uhr ET grob
      const kickoffAt =
        TOURNAMENT_START_UTC +
        (mdBaseDay + dayWithinMd) * DAY_MS +
        slotInDay * 2 * 60 * 60 * 1000; // je Slot +2h

      matches.push({
        matchId: `${g}${pairIdx + 1}`,
        phase: 'gruppenphase',
        groupLabel: `Gruppe ${g}`,
        teamA: teams[p.a],
        teamB: teams[p.b],
        kickoffAt,
        matchday: p.md,
      });
    });
  });

  return matches.sort((a, b) => a.kickoffAt - b.kickoffAt);
};

export const WM2026_GROUP_SCHEDULE: WmMatch[] = buildSchedule();

export const GROUP_TEAMS = GROUPS;

// Österreich-Gruppe für den Österreich-Block der Spezialwetten.
export const AUSTRIA_GROUP = 'Gruppe C';
export const AUSTRIA_MATCHES = WM2026_GROUP_SCHEDULE.filter(
  m => m.teamA === 'Österreich' || m.teamB === 'Österreich',
);
