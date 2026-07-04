import type { Context } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';
import { fetchMatches, regulationScore, type FdoMatch } from './_lib/footballData';

// ADMIN-ONLY Diagnose: warum löst ein WM-Markt (noch) nicht auto-auf?
// Zeigt je gesperrtem/offenem wm-match-Markt die API-Daten und was die
// 90-Min-Auflösung (regulationScore) daraus macht — inkl. Grund, wenn nichts
// passiert (kein API-Treffer, nicht FINISHED, oder ET/Elfer ohne 90-Min-Stand).
export default async (req: Request, _ctx: Context) => {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status ?? 401);

  try {
    const db = getDb();
    // Offene + gesperrte WM-Märkte (die auto-resolve betreffen, sind die gesperrten).
    const snap = await db.collection('markets').where('marketSubtype', '==', 'wm-match').get();
    const markets = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(m => m.status === 'open' || m.status === 'locked');

    // Alle FINISHED-WC-Spiele (das nutzt auch auto-resolve).
    const finished = await fetchMatches('WC', 'FINISHED');
    const byId = new Map<number, FdoMatch>();
    for (const m of finished) if (typeof m.id === 'number') byId.set(m.id, m);

    const rows = markets.map(m => {
      const fdoId: number | null = typeof m.footballDataOrgId === 'number' ? m.footballDataOrgId : null;
      const api = fdoId != null ? byId.get(fdoId) : undefined;
      const reg = api ? regulationScore(api) : { home: null, away: null };
      let status = '';
      if (m.status !== 'locked') status = `⏸️ Markt ist '${m.status}' (auto-resolve prüft nur 'locked')`;
      else if (fdoId == null) status = '❌ Markt hat keine footballDataOrgId → nie zuordenbar (Spielplan neu verknüpfen)';
      else if (!api) status = '⏳ API meldet dieses Spiel (noch) NICHT als FINISHED';
      else if (reg.home == null || reg.away == null) status = `⚠️ FINISHED, aber KEIN 90-Min-Stand (duration=${api.score?.duration}) → Auto-Auflösung übersprungen; manuell auflösen`;
      else status = `✅ auflösbar → 90 Min ${reg.home}:${reg.away}`;
      return {
        market: m.question ?? m.id,
        marketStatus: m.status,
        footballDataOrgId: fdoId,
        apiFound: !!api,
        apiStatus: api?.status ?? null,
        duration: api?.score?.duration ?? null,
        regularTime: api?.score?.regularTime ?? null,
        fullTime: api?.score?.fullTime ?? null,
        penalties: api?.score?.penalties ?? null,
        computed90Min: (reg.home != null && reg.away != null) ? `${reg.home}:${reg.away}` : null,
        diagnosis: status,
      };
    });

    return json({
      ok: true,
      lockedOrOpenWmMarkets: markets.length,
      apiFinishedCount: finished.length,
      rows,
    });
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? 'Diagnose fehlgeschlagen.' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
