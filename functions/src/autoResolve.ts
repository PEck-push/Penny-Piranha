/**
 * autoResolveMatches — Cloud Scheduler, runs every 5 minutes.
 *
 * Fetches finished WM 2026 matches from football-data.org and resolves
 * the corresponding locked markets automatically.
 *
 * Requires env var: FOOTBALL_DATA_API_KEY
 * API docs: https://www.football-data.org/documentation/quickstart
 * WM 2026 competition code: WC (or check after the competition is registered)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as https from 'https';
import { resolveMarket } from './resolveMarket';

const db = () => admin.firestore();

interface FdoMatch {
  id: number;
  status: string; // 'FINISHED' | 'LIVE' | etc.
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  homeTeam: { name: string };
  awayTeam: { name: string };
}

interface FdoResponse {
  matches: FdoMatch[];
}

function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Auth-Token': apiKey } }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

export async function autoResolveMatchesJob(): Promise<void> {
  const apiKey = functions.config().football_data?.api_key;
  if (!apiKey) {
    console.warn('[autoResolve] FOOTBALL_DATA_API_KEY not configured — skipping');
    return;
  }

  const url = 'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED';
  let response: FdoResponse;
  try {
    response = await fetchJson<FdoResponse>(url, apiKey);
  } catch (err) {
    console.error('[autoResolve] API fetch failed:', err);
    return;
  }

  const firestore = db();

  for (const match of response.matches) {
    if (match.status !== 'FINISHED') continue;

    const home = match.score.fullTime.home;
    const away = match.score.fullTime.away;
    if (home === null || away === null) continue;

    // Find market linked to this football-data.org match ID (via footballDataOrgId field)
    // OR via matchId if we mapped them
    const marketsSnap = await firestore
      .collection('markets')
      .where('status', '==', 'locked')
      .where('marketSubtype', '==', 'wm-match')
      .get();

    for (const marketDoc of marketsSnap.docs) {
      const market = marketDoc.data();
      const fdoId: number | undefined = market.footballDataOrgId;
      if (fdoId !== match.id) continue;

      // Determine winning option
      let winningOptionId: string;
      if (home > away) {
        winningOptionId = 'home';
      } else if (away > home) {
        winningOptionId = 'away';
      } else {
        winningOptionId = 'draw';
      }

      // Check if we should use the actual option ID (in case admin named them differently)
      const options: Array<{ id: string; label: string }> = market.options ?? [];
      if (!options.find(o => o.id === winningOptionId)) {
        // Fallback: use index (0=home, 1=draw, 2=away)
        const idx = home > away ? 0 : away > home ? 2 : 1;
        winningOptionId = options[idx]?.id ?? winningOptionId;
      }

      try {
        await resolveMarket(marketDoc.id, winningOptionId, 'auto');
        console.log(`[autoResolve] Resolved market ${marketDoc.id} (${market.teamA} ${home}-${away} ${market.teamB}) → ${winningOptionId}`);
      } catch (err) {
        console.error(`[autoResolve] Failed to resolve market ${marketDoc.id}:`, err);
      }
    }
  }
}
