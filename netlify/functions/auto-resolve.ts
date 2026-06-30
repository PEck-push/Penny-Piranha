import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { fetchMatches, regulationScore } from './_lib/footballData';
import { resolveMarketAdmin } from './_lib/resolve';
import { verifyCron } from './_lib/cronAuth';

// Läuft alle 15 Min. Löst gesperrte WM-/Test-Märkte auf, sobald die API das
// Spiel als FINISHED meldet. WICHTIG (Read-/API-Sparen): Wenn KEIN Markt auf ein
// Ergebnis wartet (kein gesperrter wm-match-Markt), bricht die Funktion sofort ab
// — kein API-Call, keine weiteren Lesevorgänge. Sie arbeitet also nur im Fenster
// zwischen Anpfiff (Markt wird gesperrt) und Auflösung.
export default async (req: Request) => {
  if (!(await verifyCron(req))) return new Response('forbidden', { status: 403 });

  const db = getDb();

  // 1) Gesperrte Märkte zuerst (eine günstige Query). Nichts gesperrt → Schluss.
  const lockedSnap = await db
    .collection('markets')
    .where('status', '==', 'locked')
    .where('marketSubtype', '==', 'wm-match')
    .get();
  if (lockedSnap.empty) return new Response('idle-no-locked', { status: 200 });

  const marketByFdoId = new Map<number, { id: string; data: any }>();
  lockedSnap.forEach(d => {
    const data = d.data();
    if (typeof data.footballDataOrgId === 'number') {
      marketByFdoId.set(data.footballDataOrgId, { id: d.id, data });
    }
  });
  // Kein gesperrter Markt mit footballDataOrgId → nichts automatisch aufzulösen.
  if (marketByFdoId.size === 0) return new Response('idle-no-api-markets', { status: 200 });

  // 2) Erst jetzt die API abfragen (WC; per RESOLVE_COMPETITIONS überschreibbar).
  const comps = (process.env.RESOLVE_COMPETITIONS ?? 'WC')
    .split(',').map(c => c.trim()).filter(Boolean);
  const finished: any[] = [];
  for (const c of comps) {
    try {
      finished.push(...await fetchMatches(c, 'FINISHED'));
    } catch (err: any) {
      console.error(`[auto-resolve] ${c} API error:`, err.message);
    }
  }
  if (finished.length === 0) return new Response('no-finished', { status: 200 });

  let resolved = 0;

  for (const m of finished) {
    const entry = marketByFdoId.get(m.id);
    if (!entry) continue; // kein passender gesperrter Markt → überspringen (auch kein Write)

    // 90-MIN-STAND (reguläre Spielzeit inkl. Nachspielzeit) — NICHT fullTime, da
    // fullTime die Verlängerung enthält. So bleibt in der K.-o.-Phase X möglich.
    const reg = regulationScore(m);
    const home = reg.home;
    const away = reg.away;
    // Kein ermittelbarer 90-Min-Stand → NICHT auto-auflösen. Das passiert bei
    // ET-/Elfer-Spielen, deren regularTime (noch) fehlt: lieber auslassen und
    // der Admin löst manuell/korrigiert auf, als fälschlich den ET-Stand zu nehmen.
    if (home === null || away === null || home === undefined || away === undefined) continue;

    // Schedule-Doc einmalig aktualisieren (nur für Märkte, die wir auflösen).
    await db.collection('schedule').doc(`wc-${m.id}`).set(
      { status: 'finished', scoreA: home, scoreB: away }, { merge: true });

    const options: Array<{ id: string }> = entry.data.options ?? [];

    // WETTBÜRO-STANDARD (1X2 / 90-Min-Markt): Endstand nach regulärer Spielzeit
    // (inkl. Nachspielzeit) entscheidet — Verlängerung und Elfmeterschießen
    // zählen NICHT. Der 90-Min-Stand kommt aus regulationScore() (= score.regularTime
    // bei ET/Elfer, sonst fullTime). Daher gewinnt bei K.-o.-Spielen mit 1:1 nach
    // 90 Min der Tipp auf „Unentschieden" (X), unabhängig vom finalen Sieger.
    let key: 'home' | 'away' | 'draw';
    if (home > away) key = 'home';
    else if (away > home) key = 'away';
    else key = 'draw';

    let winningOptionId: string = key;
    // Fallback to positional option ids if custom labels were used
    if (!options.find(o => o.id === winningOptionId)) {
      const idx = key === 'home' ? 0 : key === 'away' ? 2 : 1;
      winningOptionId = options[idx]?.id ?? winningOptionId;
    }

    const score = {
      home: home as number,
      away: away as number,
      duration: m.score?.duration,
      penaltiesHome: m.score?.penalties?.home ?? null,
      penaltiesAway: m.score?.penalties?.away ?? null,
      // Zuverlässiger Sieger nach Verlängerung/Elfer (für die Anzeige, falls die
      // i.E.-Bilalz fehlt/unzuverlässig ist).
      shootoutWinner: m.score?.winner === 'HOME_TEAM' ? 'home' as const
        : m.score?.winner === 'AWAY_TEAM' ? 'away' as const : null,
      teamA: entry.data.teamA ?? m.homeTeam?.name ?? 'Heim',
      teamB: entry.data.teamB ?? m.awayTeam?.name ?? 'Gast',
    };

    try {
      await resolveMarketAdmin(entry.id, winningOptionId, 'auto', score);
      resolved++;
      console.log(`[auto-resolve] ${entry.data.teamA} ${home}-${away} ${entry.data.teamB} → ${winningOptionId}`);
    } catch (err: any) {
      console.error(`[auto-resolve] failed market ${entry.id}:`, err.message);
    }
  }

  return new Response(JSON.stringify({ resolved }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  schedule: '*/15 * * * *',
};
