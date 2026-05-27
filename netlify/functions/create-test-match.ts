import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAdmin } from './_lib/adminAuth';
import { fetchMatches } from './_lib/footballData';

// HTTP POST — admin-only. Golden-Test mit einem echten Spiel (z. B. CL-Finale):
//   { action: 'list',   competition?='CL' }
//       → listet Spiele (id, Teams, Anpfiff, Status) — zugleich API-Konnektivitätstest
//   { action: 'create', competition?='CL', footballDataOrgId }
//       → legt einen wm-match-Markt an (mit echter footballDataOrgId), den
//         auto-resolve nach Abpfiff automatisch auflöst.
export default async (req: Request, _context: Context) => {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, footballDataOrgId } = body ?? {};
  const competition = (body?.competition || 'CL').toString();

  try {
    if (action === 'list') {
      const matches = await fetchMatches(competition);
      const list = matches
        .map(m => ({
          id: m.id,
          home: m.homeTeam?.name ?? '?',
          away: m.awayTeam?.name ?? '?',
          utcDate: m.utcDate,
          status: m.status,
        }))
        .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
      return json({ ok: true, competition, count: list.length, matches: list });
    }

    if (action === 'create') {
      if (!footballDataOrgId) return json({ error: 'footballDataOrgId fehlt.' }, 400);
      const db = getDb();

      // Doppelten Markt vermeiden
      const existing = await db.collection('markets').where('footballDataOrgId', '==', Number(footballDataOrgId)).get();
      if (!existing.empty) return json({ ok: true, skipped: true, message: 'Markt existiert bereits.' });

      const matches = await fetchMatches(competition);
      const m = matches.find(x => x.id === Number(footballDataOrgId));
      if (!m) return json({ error: 'Spiel nicht gefunden.' }, 404);

      const home = m.homeTeam?.name ?? 'Heim';
      const away = m.awayTeam?.name ?? 'Gast';
      const kickoffAt = new Date(m.utcDate).getTime();
      const now = Date.now();
      const locked = kickoffAt <= now;

      const ref = db.collection('markets').doc();
      await ref.set({
        question: `${home} vs. ${away}`,
        type: 'standard',
        status: locked ? 'locked' : 'open',
        createdBy: 'admin-test',
        createdAt: now,
        options: [
          { id: 'home', label: home, pool: 0 },
          { id: 'draw', label: 'Unentschieden', pool: 0 },
          { id: 'away', label: away, pool: 0 },
        ],
        winningOptionId: null,
        resolutionType: null,
        isOpenQuestion: false,
        marketSubtype: 'wm-match',
        matchId: `${competition.toLowerCase()}-${m.id}`,
        footballDataOrgId: m.id,
        teamA: home,
        teamB: away,
        kickoffAt,
        groupLabel: `${competition}-Test`,
        phase: 'gruppenphase',
        minBet: 10,
        maxBet: 150,
        autoDeductAmount: 10,
        autoDeductProcessed: locked,
        ...(locked ? { lockedPoolSnapshot: { home: 0, draw: 0, away: 0 }, lockedAt: FieldValue.serverTimestamp() } : {}),
      });
      return json({ ok: true, question: `${home} vs. ${away}`, status: locked ? 'locked' : 'open', kickoffAt });
    }

    return json({ error: `Unbekannte action: ${action}` }, 400);
  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
