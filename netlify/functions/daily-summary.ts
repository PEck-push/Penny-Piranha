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

// Rotierende Intros — variieren taeglich (deterministisch ueber den Wochentag,
// damit man nicht zweimal hintereinander dasselbe sieht).
const INTROS_TOURNAMENT = [
  '📰 Wer ist heiß, wer kalt',
  '🍻 Frische Tagesbilanz',
  '⚡ Stand der Dinge',
  '🎯 Daily der Wahrsager',
  '🦅 Adlerblick auf gestern',
  '📊 Krügerl-Update',
  '🔥 Heißeste Propheten',
];

const INTROS_PRE = [
  '⏰ Countdown zur ersten Wette',
  '🍻 Bald geht\'s los — Zeit für die Tipps',
  '🎯 Aufgepasst: Vorbereitung läuft',
  '🚀 Letzte Chance vor dem Anpfiff',
];

function pickIntro(pool: string[], todayKey: string): string {
  // Hash aus dem todayKey-String → konstanter Index pro Tag
  let h = 0;
  for (const c of todayKey) h = (h * 31 + c.charCodeAt(0)) | 0;
  return pool[Math.abs(h) % pool.length];
}

async function buildSummary(): Promise<string> {
  const db = getDb();
  const now = Date.now();
  const todayKey = viennaDayKey(now);
  const tomorrowKey = viennaDayKey(now + 24 * 60 * 60 * 1000);

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
  const markets: any[] = marketsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const schedule: ScheduleEntry[] = scheduleSnap.docs.map(d => ({ matchId: d.id, ...(d.data() as any) }));
  const shopItems: ShopItem[] = shopSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // ── Turnier-Phase erkennen: vor dem ersten Spiel = Pre-Tournament-Modus ──
  // Definition: das erste Match hat noch nicht angepfiffen (kickoffAt > now)
  // UND kein einziges Match wurde bisher aufgeloest. Sobald das erste Spiel
  // laeuft/vorbei ist, wechselt der Modus.
  const earliestKickoff = schedule
    .map(s => s.kickoffAt)
    .filter(t => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b)[0];
  const anyResolved = markets.some((m: any) => m.status === 'resolved');
  const inTournament = anyResolved || (earliestKickoff != null && earliestKickoff <= now);

  // 2. Tagessieger / Pechvogel — nur im Turnier-Modus relevant
  const withGain = players
    .map(p => ({ name: p.name ?? '—', gain: p.dailyNetGain ?? 0 }))
    .filter(p => p.gain !== 0);
  const sieger = withGain.filter(p => p.gain > 0).sort((a, b) => b.gain - a.gain)[0] ?? null;
  const pech   = withGain.filter(p => p.gain < 0).sort((a, b) => a.gain - b.gain)[0] ?? null;

  // 3. Top 3 Gesamt — tokens + offene Einsaetze in noch nicht aufgeloesten Maerkten
  const openMarketIds = new Set(
    markets.filter((m: any) => m.status === 'open' || m.status === 'locked').map((m: any) => m.id),
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
    .filter(m => m.kickoffAt > now - 60 * 60 * 1000)
    .sort((a, b) => a.kickoffAt - b.kickoffAt);
  const tomorrowMatches = schedule
    .filter(m => viennaDayKey(m.kickoffAt) === tomorrowKey)
    .sort((a, b) => a.kickoffAt - b.kickoffAt);

  // 5. Shop-Drops — heute + Vorschau morgen
  const allUpcoming = shopItems
    .filter(it => it.available)
    .map(it => ({ it, at: shopUnlockAt(it, schedule) }))
    .filter(x => x.at != null) as { it: ShopItem; at: number }[];
  const shopDropsToday = allUpcoming
    .filter(x => viennaDayKey(x.at) === todayKey && x.at >= now - 6 * 60 * 60 * 1000)
    .map(x => ({ label: x.it.label, price: x.it.price, stock: x.it.stock ?? null, time: viennaTime(x.at), at: x.at }));
  const shopDropsTomorrow = allUpcoming
    .filter(x => viennaDayKey(x.at) === tomorrowKey)
    .map(x => ({ label: x.it.label, price: x.it.price, stock: x.it.stock ?? null, time: viennaTime(x.at), at: x.at }));

  // ── Pre-Tournament: Shop-Drops der naechsten 7 Tage (Preisankuendigung) ──
  const sevenDaysMs = now + 7 * 24 * 60 * 60 * 1000;
  const shopDropsWeek = allUpcoming
    .filter(x => x.at >= now - 6 * 60 * 60 * 1000 && x.at <= sevenDaysMs)
    .sort((a, b) => a.at - b.at)
    .map(x => ({
      label: x.it.label,
      price: x.it.price,
      stock: x.it.stock ?? null,
      dateDay: viennaDayKey(x.at).slice(8) + '.' + viennaDayKey(x.at).slice(5, 7) + '.',
      time: viennaTime(x.at),
    }));

  // ── Offene Jackpot-Tipps (gratis Wetten, noch nicht aufgeloest) ──
  const openJackpotMarkets = markets.filter((m: any) =>
    (m.marketSubtype === 'jackpot' || m.noStake === true) && (m.status === 'open' || m.status === 'locked'),
  );

  // ── Text bauen ──
  const dateStr = new Intl.DateTimeFormat('de-AT', {
    timeZone: VIENNA_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(now));
  const lines: string[] = [];

  // ─── A) Pre-Tournament-Modus ───────────────────────────────────────────
  if (!inTournament) {
    lines.push(`🍺 *KRÜGERL-PROPHETEN — Auf in die WM!*`);
    lines.push(`_${pickIntro(INTROS_PRE, todayKey)}_  ·  ${dateStr}`);
    lines.push('');

    // Countdown bis erstes Spiel
    if (earliestKickoff != null) {
      const first = schedule.find(s => s.kickoffAt === earliestKickoff)!;
      const hoursUntil = Math.round((earliestKickoff - now) / (60 * 60 * 1000));
      const days = Math.floor(hoursUntil / 24);
      const remHours = hoursUntil % 24;
      const countdown = days > 0
        ? `in ${days} Tag${days === 1 ? '' : 'en'}${remHours > 0 ? ` und ${remHours}h` : ''}`
        : `in ${remHours}h`;
      lines.push(`⏰ Erstes Spiel ${countdown}:`);
      lines.push(`   *${first.teamA} vs. ${first.teamB}* — ${viennaTime(first.kickoffAt)} CEST`);
      lines.push('');
    }

    if (openJackpotMarkets.length > 0) {
      lines.push(`🎰 *${openJackpotMarkets.length} Gratis-Tipps warten* — kostenlos, Preise aus der Hausbank:`);
      for (const m of openJackpotMarkets.slice(0, 10)) {
        const prize = m.fixedPrize ? ` (${fmtTKN(m.fixedPrize)} TKN)` : '';
        lines.push(`   • ${m.question}${prize}`);
      }
      if (openJackpotMarkets.length > 10) {
        lines.push(`   … und ${openJackpotMarkets.length - 10} weitere`);
      }
      lines.push('');
    }

    if (tomorrowMatches.length > 0) {
      lines.push('⚽ *Morgen am Start:*');
      for (const m of tomorrowMatches.slice(0, 8)) {
        lines.push(`   ${viennaTime(m.kickoffAt)}  ${m.teamA} vs. ${m.teamB}`);
      }
      lines.push('');
    }

    if (shopDropsWeek.length > 0) {
      lines.push('🛒 *Shop-Releases:*');
      for (const it of shopDropsWeek) {
        const stockStr = it.stock != null ? ` · ${it.stock} Stück` : '';
        lines.push(`   • ${it.dateDay} ${it.time} — ${it.label} · ${fmtTKN(it.price)} TKN${stockStr}`);
      }
      lines.push('');
    }

    lines.push('Tippen 👉 https://kruegerl-propheten.netlify.app');
    return lines.join('\n');
  }

  // ─── B) Turnier-Modus (Standard-Daily) ─────────────────────────────────
  lines.push(`🍺 *KRÜGERL-PROPHETEN — Tagesspiegel ${dateStr}*`);
  lines.push(`_${pickIntro(INTROS_TOURNAMENT, todayKey)}_`);
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
  } else if (tomorrowMatches.length > 0) {
    lines.push('⚽ Morgen:');
    for (const m of tomorrowMatches.slice(0, 6)) {
      lines.push(`   ${viennaTime(m.kickoffAt)}  ${m.teamA} vs. ${m.teamB}`);
    }
    lines.push('');
  }

  if (shopDropsToday.length > 0) {
    lines.push(`🛒 Shop heute um ${shopDropsToday[0].time}:`);
    for (const it of shopDropsToday) {
      const stockStr = it.stock != null ? ` (${it.stock} Stück)` : '';
      lines.push(`   • ${it.label} — ${fmtTKN(it.price)} TKN${stockStr}`);
    }
    lines.push('');
  } else if (shopDropsTomorrow.length > 0) {
    lines.push(`🛒 Shop morgen um ${shopDropsTomorrow[0].time}:`);
    for (const it of shopDropsTomorrow) {
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
