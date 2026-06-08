import type { Config } from '@netlify/functions';
import { getDb } from './_lib/firebaseAdmin';

// Tagessummary: Lauft taeglich um 08:00 UTC = 10:00 CEST. Generiert einen
// kompakten Text mit Tagessieger/Pechvogel, Top 3 Gesamt, heutigen Matches
// und Shop-Drops; schickt ihn per Telegram-Bot an die hinterlegte Chat-ID.
// Vorlage zum Weiterleiten in die WhatsApp-Gruppe.
//
// Env-Variablen (in Netlify):
//   TELEGRAM_BOT_TOKEN  Bot-Token aus @BotFather
//   TELEGRAM_CHAT_ID    Eigene Chat-ID (oder Gruppen-ID), wo der Bot postet
//
// Setup-Hilfe:
//   1. In Telegram @BotFather oeffnen → /newbot → Name + Username → Token erhalten
//   2. Bot anschreiben (irgendeine Nachricht) damit er Chat-ID kennt
//   3. https://api.telegram.org/bot<TOKEN>/getUpdates → result[0].message.chat.id
//   4. Beide Werte in Netlify Env-Vars eintragen → redeploy

const VIENNA_TZ = 'Europe/Vienna';

// Wiener Kalendertag (YYYY-MM-DD) aus UTC-Timestamp.
function viennaDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VIENNA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

// Wiener Uhrzeit (HH:MM) aus UTC-Timestamp.
function viennaTime(ms: number): string {
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: VIENNA_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

// 12:00 Wiener Zeit eines Kalendertags als UTC-ms. DST-aware (Mai–Okt: UTC+2).
function viennaNoonUtc(y: number, m: number, d: number): number {
  // Wir nehmen 10:00 UTC (= 12:00 CEST im Sommer) als Naeherung — fuer
  // WM 2026 (11. Juni – 19. Juli) gilt durchgaengig CEST.
  return Date.UTC(y, m - 1, d, 10, 0, 0);
}

interface Player {
  id: string;
  name?: string;
  tokens?: number;
  dailyNetGain?: number;
  isTestPlayer?: boolean;
  isAdmin?: boolean;
}
interface Bet {
  playerId: string;
  marketId: string;
  amount: number;
}
interface Market {
  id: string;
  status: 'open' | 'locked' | 'resolved' | 'cancelled' | 'paused';
}
interface ScheduleEntry {
  matchId: string;
  teamA: string;
  teamB: string;
  kickoffAt: number;
  groupLabel?: string;
  matchday?: number;
  phase?: string;
}
interface ShopItem {
  id: string;
  label: string;
  price: number;
  available?: boolean;
  availableFrom?: number;
  unlockRule?: { kind: 'fifaMatchday' | 'matchCalendarDay' | 'afterGroupStage'; matchday?: number; day?: number };
  stock?: number | null;
  sold?: number;
}

// Item-Freischalt-Timestamp (UTC ms) ableiten. Liefert null wenn nicht berechenbar.
function shopUnlockAt(item: ShopItem, schedule: ScheduleEntry[]): number | null {
  if (item.availableFrom) return item.availableFrom;
  if (!item.unlockRule) return null;
  const valid = schedule.filter(m => Number.isFinite(m.kickoffAt));
  if (valid.length === 0) return null;
  try {
    if (item.unlockRule.kind === 'fifaMatchday') {
      const md = item.unlockRule.matchday;
      const ks = valid.filter(m => m.matchday === md).map(m => m.kickoffAt);
      if (ks.length === 0) return null;
      const [y, m, d] = viennaDayKey(Math.min(...ks)).split('-').map(Number);
      return viennaNoonUtc(y, m, d);
    }
    if (item.unlockRule.kind === 'matchCalendarDay') {
      const days = Array.from(new Set(valid.map(m => viennaDayKey(m.kickoffAt)))).sort();
      const key = days[(item.unlockRule.day ?? 1) - 1];
      if (!key) return null;
      const [y, m, d] = key.split('-').map(Number);
      return viennaNoonUtc(y, m, d);
    }
    // afterGroupStage
    const groupMs = valid.filter(m => (m.phase ?? 'gruppenphase') === 'gruppenphase').map(m => m.kickoffAt);
    if (groupMs.length === 0) return null;
    const [y, m, d] = viennaDayKey(Math.max(...groupMs)).split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return viennaNoonUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  } catch { return null; }
}

function fmtTKN(n: number): string {
  return new Intl.NumberFormat('de-AT').format(Math.round(n));
}

async function buildSummary(): Promise<string> {
  const db = getDb();
  const now = Date.now();
  const todayKey = viennaDayKey(now);

  // 1. Spieler + Bets + Markets parallel lesen
  const [playersSnap, betsSnap, marketsSnap, scheduleSnap, shopSnap] = await Promise.all([
    db.collection('players').get(),
    db.collection('bets').get(),
    db.collection('markets').get(),
    db.collection('schedule').get(),
    db.collection('shopItems').get(),
  ]);

  const players: Player[] = playersSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(p => !p.isTestPlayer);
  const bets: Bet[] = betsSnap.docs.map(d => ({ ...(d.data() as any) }));
  const markets: Market[] = marketsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const schedule: ScheduleEntry[] = scheduleSnap.docs.map(d => ({ matchId: d.id, ...(d.data() as any) }));
  const shopItems: ShopItem[] = shopSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // 2. Tagessieger / Pechvogel — anhand dailyNetGain
  const withGain = players
    .map(p => ({ name: p.name ?? '—', gain: p.dailyNetGain ?? 0 }))
    .filter(p => p.gain !== 0);
  const sieger = withGain.filter(p => p.gain > 0).sort((a, b) => b.gain - a.gain)[0] ?? null;
  const pech   = withGain.filter(p => p.gain < 0).sort((a, b) => a.gain - b.gain)[0] ?? null;

  // 3. Top 3 Gesamt — tokens + offene Einsaetze in noch nicht aufgeloesten Maerkten
  const openMarketIds = new Set(
    markets.filter(m => m.status === 'open' || m.status === 'locked').map(m => m.id),
  );
  const openStakeByPlayer: Record<string, number> = {};
  for (const b of bets) {
    if (openMarketIds.has(b.marketId)) {
      openStakeByPlayer[b.playerId] = (openStakeByPlayer[b.playerId] ?? 0) + (b.amount ?? 0);
    }
  }
  const ranked = players
    .map(p => ({
      name: p.name ?? '—',
      total: (p.tokens ?? 0) + (openStakeByPlayer[p.id] ?? 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // 4. Heutige Matches (Wiener Kalendertag) — sortiert nach Anpfiff
  const todayMatches = schedule
    .filter(m => viennaDayKey(m.kickoffAt) === todayKey)
    .filter(m => m.kickoffAt > now - 60 * 60 * 1000) // nicht-vergangene
    .sort((a, b) => a.kickoffAt - b.kickoffAt);

  // 5. Shop-Drops heute (Freischaltung zwischen jetzt und Tag-Ende, oder bereits
  //    heute frueh am gleichen Kalendertag) — typischerweise 12:00 Wien.
  const tomorrowKey = viennaDayKey(now + 24 * 60 * 60 * 1000);
  const shopDropsToday = shopItems
    .filter(it => {
      if (!it.available) return false;
      const at = shopUnlockAt(it, schedule);
      if (at == null) return false;
      return viennaDayKey(at) === todayKey && at >= now - 6 * 60 * 60 * 1000;
    })
    .map(it => ({
      label: it.label,
      price: it.price,
      stock: it.stock ?? null,
      unlockTime: viennaTime(shopUnlockAt(it, schedule)!),
    }));

  // 6. Text zusammenbauen — Sektionen mit leeren Daten werden uebersprungen.
  const dateStr = new Intl.DateTimeFormat('de-AT', {
    timeZone: VIENNA_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(now));

  const lines: string[] = [];
  lines.push(`🍺 *KRÜGERL-PROPHETEN — Tagesspiegel ${dateStr}*`);
  lines.push('');

  if (sieger || pech) {
    if (sieger) lines.push(`🏆 Tagessieger: *${sieger.name}* (+${fmtTKN(sieger.gain)} TKN)`);
    if (pech)   lines.push(`💀 Pechvogel:   *${pech.name}* (${fmtTKN(pech.gain)} TKN)`);
    lines.push('');
  }

  if (ranked.length > 0) {
    lines.push('📊 Top 3 Gesamt:');
    ranked.forEach((p, i) => {
      lines.push(`   ${i + 1}. ${p.name} — ${fmtTKN(p.total)} TKN`);
    });
    lines.push('');
  }

  if (todayMatches.length > 0) {
    lines.push('⚽ Heute auf dem Plan:');
    for (const m of todayMatches) {
      lines.push(`   ${viennaTime(m.kickoffAt)}  ${m.teamA} vs. ${m.teamB}`);
    }
    lines.push('');
  } else if (tomorrowKey !== todayKey) {
    const tomorrowMatches = schedule
      .filter(m => viennaDayKey(m.kickoffAt) === tomorrowKey)
      .sort((a, b) => a.kickoffAt - b.kickoffAt);
    if (tomorrowMatches.length > 0) {
      lines.push('⚽ Morgen:');
      for (const m of tomorrowMatches.slice(0, 6)) {
        lines.push(`   ${viennaTime(m.kickoffAt)}  ${m.teamA} vs. ${m.teamB}`);
      }
      lines.push('');
    }
  }

  if (shopDropsToday.length > 0) {
    lines.push(`🛒 Shop um ${shopDropsToday[0].unlockTime}:`);
    for (const it of shopDropsToday) {
      const stockStr = it.stock != null ? ` (${it.stock} Stück)` : '';
      lines.push(`   • ${it.label} — ${fmtTKN(it.price)} TKN${stockStr}`);
    }
    lines.push('');
  }

  lines.push('Jetzt tippen 👉 https://kruegerl-propheten.netlify.app');

  return lines.join('\n');
}

async function sendToTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: 'TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlt.' };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: `Telegram HTTP ${res.status}: ${(data as any).description ?? ''}` };
  }
  return { ok: true };
}

export default async (_req: Request) => {
  try {
    const text = await buildSummary();
    const result = await sendToTelegram(text);
    if (!result.ok) {
      console.error('[daily-summary]', result.error);
      return new Response(JSON.stringify({ ok: false, error: result.error, preview: text }), { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true, length: text.length }), { status: 200 });
  } catch (err: any) {
    console.error('[daily-summary] fatal:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }
};

// Taeglich 08:00 UTC = 10:00 CEST (im Sommer; passt fuer WM 2026 = Juni/Juli).
export const config: Config = {
  schedule: '0 8 * * *',
};
