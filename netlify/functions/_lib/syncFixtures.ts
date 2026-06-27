import { getDb, FieldValue } from './firebaseAdmin';
import { fetchMatches, normalizeGroup, stageToPhase } from './footballData';
import { deName } from '../../../src/utils/teams';

// ─── Begegnungen aus der API neu einspielen (K.-o.-Phase: TBD → echte Teams) ───
//
// In der K.-o.-Phase werden Märkte/Spielplan-Einträge oft als „TBD vs. TBD"
// angelegt, bevor die Paarung feststeht. Sobald die API die echten Teams kennt,
// aktualisiert diese Funktion:
//   1) die schedule-Docs (Teamnamen, Anpfiff, Phase/Gruppe/Spieltag) — OHNE
//      scoreA/scoreB/status anzufassen (damit manuelle Ergebnis-Korrekturen und
//      auto-resolve nicht überschrieben werden),
//   2) bereits angelegte, noch NICHT aufgelöste WM-Märkte (open/locked):
//      teamA/teamB, Frage-Titel und die Optionen-Labels (home/away) — Pools
//      bleiben erhalten.
//
// Idempotent: ändert nur, was wirklich abweicht. „TBD" wird nie über einen schon
// bekannten Namen geschrieben (kein Rückschritt, falls die API mal zickt).
// dryRun=true → liefert nur den Report, schreibt nichts.

export interface FixtureSyncReport {
  ok: boolean;
  dryRun: boolean;
  fetched: number;
  scheduleUpdated: number;
  marketsUpdated: Array<{ marketId: string; matchId: string; from: string; to: string }>;
  note?: string;
}

const isTbd = (name?: string | null) => !name || /tbd/i.test(name);

export async function syncFixtures(opts: { dryRun?: boolean } = {}): Promise<FixtureSyncReport> {
  const dryRun = !!opts.dryRun;
  const db = getDb();
  const matches = await fetchMatches('WC');

  // API-Match je schedule-Doc-ID (wc-<id>) für die Markt-Verknüpfung.
  const apiByDocId = new Map<string, any>();
  for (const m of matches) apiByDocId.set(`wc-${m.id}`, m);

  // ── 1) schedule-Docs: Teams/Anpfiff/Phase/Gruppe/Spieltag (KEINE Scores!) ───
  let scheduleUpdated = 0;
  if (!dryRun) {
    let batch = db.batch();
    let ops = 0;
    for (const m of matches) {
      const ref = db.collection('schedule').doc(`wc-${m.id}`);
      batch.set(ref, {
        footballDataOrgId: m.id,
        phase: stageToPhase(m.stage),
        groupLabel: normalizeGroup(m.group),
        teamA: m.homeTeam?.name ?? 'TBD',
        teamB: m.awayTeam?.name ?? 'TBD',
        kickoffAt: new Date(m.utcDate).getTime(),
        matchday: m.matchday ?? null,
      }, { merge: true });
      scheduleUpdated++;
      if (++ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  } else {
    scheduleUpdated = matches.length;
  }

  // ── 2) Noch offene/gesperrte WM-Märkte auf die echten Teams heben ──────────
  const mSnap = await db.collection('markets').where('marketSubtype', '==', 'wm-match').get();
  const marketsUpdated: FixtureSyncReport['marketsUpdated'] = [];
  let batch2 = db.batch();
  let ops2 = 0;

  for (const d of mSnap.docs) {
    const mk = d.data() as any;
    if (mk.status !== 'open' && mk.status !== 'locked') continue; // resolved/cancelled nie anfassen
    const api = apiByDocId.get(mk.matchId)
      ?? (typeof mk.footballDataOrgId === 'number' ? apiByDocId.get(`wc-${mk.footballDataOrgId}`) : undefined);
    if (!api) continue;

    const apiA = api.homeTeam?.name;
    const apiB = api.awayTeam?.name;
    const newA = isTbd(apiA) ? null : deName(apiA);
    const newB = isTbd(apiB) ? null : deName(apiB);

    const changes: Record<string, any> = {};
    if (newA && newA !== mk.teamA) changes.teamA = newA;
    if (newB && newB !== mk.teamB) changes.teamB = newB;
    // Anpfiff nur bei noch offenen Märkten nachziehen (Umlegung).
    if (mk.status === 'open') {
      const apiKick = new Date(api.utcDate).getTime();
      if (Number.isFinite(apiKick) && apiKick !== mk.kickoffAt) changes.kickoffAt = apiKick;
    }
    if (Object.keys(changes).length === 0) continue;

    const finalA = changes.teamA ?? mk.teamA;
    const finalB = changes.teamB ?? mk.teamB;
    const teamsChanged = !!(changes.teamA || changes.teamB);
    if (teamsChanged) {
      changes.question = `${finalA} vs. ${finalB}`;
      changes.options = (mk.options ?? []).map((o: any) =>
        o.id === 'home' ? { ...o, label: finalA } : o.id === 'away' ? { ...o, label: finalB } : o);
    }

    marketsUpdated.push({
      marketId: d.id,
      matchId: mk.matchId,
      from: `${mk.teamA ?? '?'} vs. ${mk.teamB ?? '?'}`,
      to: `${finalA} vs. ${finalB}`,
    });

    if (!dryRun) {
      batch2.update(d.ref, changes);
      ops2++;
      // Feed, wenn eine bisher unklare Paarung jetzt feststeht.
      if (teamsChanged && (isTbd(mk.teamA) || isTbd(mk.teamB))) {
        batch2.set(db.collection('feed').doc(), {
          type: 'market_locked',
          marketId: d.id,
          text: `⚽ Begegnung steht fest: ${finalA} vs. ${finalB}`,
          ts: FieldValue.serverTimestamp(),
        });
        ops2++;
      }
      if (ops2 >= 450) { await batch2.commit(); batch2 = db.batch(); ops2 = 0; }
    }
  }
  if (!dryRun && ops2 > 0) await batch2.commit();

  return {
    ok: true,
    dryRun,
    fetched: matches.length,
    scheduleUpdated,
    marketsUpdated,
    note: dryRun ? 'Probelauf — es wurde NICHTS geschrieben.' : undefined,
  };
}
