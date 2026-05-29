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
    fullTime: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
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
    default:               return 'gruppenphase';
  }
}

export function mapStatus(s: string): 'scheduled' | 'live' | 'finished' {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'live';
  return 'scheduled';
}
