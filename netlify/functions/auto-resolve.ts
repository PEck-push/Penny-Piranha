import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { fetchMatches } from './_lib/footballData';
import { resolveMarketAdmin } from './_lib/resolve';

// Läuft alle 15 Min. Löst gesperrte WM-/Test-Märkte auf, sobald die API das
// Spiel als FINISHED meldet. WICHTIG (Read-/API-Sparen): Wenn KEIN Markt auf ein
// Ergebnis wartet (kein gesperrter wm-match-Markt), bricht die Funktion sofort ab
// — kein API-Call, keine weiteren Lesevorgänge. Sie arbeitet also nur im Fenster
// zwischen Anpfiff (Markt wird gesperrt) und Auflösung.
export default async () => {
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

  // 2) Erst jetzt die API abfragen (WC + CL; per RESOLVE_COMPETITIONS überschreibbar).
  const comps = (process.env.RESOLVE_COMPETITIONS ?? 'WC,CL')
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

    const home = m.score?.fullTime?.home;
    const away = m.score?.fullTime?.away;
    if (home === null || away === null || home === undefined || away === undefined) continue;

    // Schedule-Doc einmalig aktualisieren (nur für Märkte, die wir auflösen).
    await db.collection('schedule').doc(`wc-${m.id}`).set(
      { status: 'finished', scoreA: home, scoreB: away }, { merge: true });

    const options: Array<{ id: string }> = entry.data.options ?? [];
    let winningOptionId: string;
    if (home > away) winningOptionId = 'home';
    else if (away > home) winningOptionId = 'away';
    else winningOptionId = 'draw';

    // Fallback to positional option ids if custom labels were used
    if (!options.find(o => o.id === winningOptionId)) {
      const idx = home > away ? 0 : away > home ? 2 : 1;
      winningOptionId = options[idx]?.id ?? winningOptionId;
    }

    try {
      await resolveMarketAdmin(entry.id, winningOptionId, 'auto');
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
