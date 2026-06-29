import https from 'node:https';

// football-data.org v4 API client. The free tier covers the FIFA World Cup
// (competition code "WC"). Requires env var FOOTBALL_DATA_API_KEY.

export interface FdoMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  stage: string;  // GROUP_STAGE | LAST_16 | ...
  group: string | null; // "GROUP_A" or "Group A" or null
  matchday: number | null;
  homeTeam: { id: number | null; name: string | null };
  awayTeam: { id: number | null; name: string | null };
  score: {
    // Tatsächlicher Sieger inkl. Verlängerung/Elfmeter (K.-o.-Phase).
    winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration?: string; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    // ACHTUNG: fullTime ENTHÄLT die Verlängerung (= Stand nach 90 + ggf. ET).
    // Der reine 90-Min-Stand (reguläre Spielzeit inkl. Nachspielzeit) steht in
    // regularTime und ist NUR bei ET/Elfer gesetzt. Für die 1X2-Auflösung immer
    // regulationScore() verwenden, NICHT fullTime.
    fullTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
    extraTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

// 90-Minuten-Stand (reguläre Spielzeit inkl. Nachspielzeit), OHNE Verlängerung
// und Elfmeterschießen — so bleibt in der K.-o.-Phase ein 3-Wege-Ergebnis (X)
// möglich (Wettbüro-Standard). football-data.org: fullTime enthält die ET, der
// 90-Min-Stand liegt in regularTime (nur bei ET/Elfer gesetzt).
//
// Rückgabe {home:null,away:null} = 90-Min-Stand (noch) nicht ermittelbar — der
// Aufrufer darf dann NICHT auflösen (statt fälschlich den ET-Stand zu nehmen).
export function regulationScore(m: FdoMatch): { home: number | null; away: number | null } {
  const dur = m.score?.duration;
  const reg = m.score?.regularTime;
  const ft = m.score?.fullTime;
  if (dur === 'EXTRA_TIME' || dur === 'PENALTY_SHOOTOUT') {
    if (reg && reg.home != null && reg.away != null) return { home: reg.home, away: reg.away };
    return { home: null, away: null }; // ET/Elfer, aber kein 90-Min-Stand → nicht raten
  }
  // Regulär entschieden: fullTime IST der 90-Min-Stand (regularTime oft nicht gesetzt).
  if (ft && ft.home != null && ft.away != null) return { home: ft.home, away: ft.away };
  if (reg && reg.home != null && reg.away != null) return { home: reg.home, away: reg.away };
  return { home: null, away: null };
}

interface FdoResponse {
  matches?: FdoMatch[];
  message?: string;
}

export function fetchMatches(competition = 'WC', statusFilter?: string): Promise<FdoMatch[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY env var is not set');

  let path = `/v4/competitions/${competition}/matches`;
  if (statusFilter) path += `?status=${statusFilter}`;

  return new Promise((resolve, reject) => {
    https
      .get(
        { hostname: 'api.football-data.org', path, headers: { 'X-Auth-Token': apiKey } },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data) as FdoResponse;
              if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(json.message || `football-data.org HTTP ${res.statusCode}`));
              }
              resolve(json.matches ?? []);
            } catch (e) {
              reject(e);
            }
          });
        },
      )
      .on('error', reject);
  });
}

// "GROUP_A" / "Group A" / "Gruppe A" → "Gruppe A"
export function normalizeGroup(group: string | null): string {
  if (!group) return '';
  const m = group.match(/([A-L])\s*$/i) || group.match(/_([A-L])$/i);
  const letter = m ? m[1].toUpperCase() : null;
  return letter ? `Gruppe ${letter}` : '';
}

export function stageToPhase(stage: string): string {
  switch (stage) {
    case 'GROUP_STAGE':    return 'gruppenphase';
    case 'LAST_32':        return 'sechzehntelfinale';
    case 'LAST_16':        return 'achtelfinale';
    case 'QUARTER_FINALS': return 'viertelfinale';
    case 'SEMI_FINALS':    return 'halbfinale';
    case 'THIRD_PLACE':    return 'platz3';
    case 'FINAL':          return 'finale';
    // Unbekannte Stages (z. B. PRELIMINARY_ROUND, PLAYOFF_ROUND_X aus anderen
    // Wettbewerben) NICHT mehr stillschweigend zur Gruppenphase machen, sonst
    // verfälscht ein versehentlicher Fremd-Import die WM-Filter.
    default:               return 'unknown';
  }
}

export function mapStatus(s: string): 'scheduled' | 'live' | 'finished' {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'live';
  return 'scheduled';
}
