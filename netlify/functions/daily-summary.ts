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

// US-Spieltag (YYYY-MM-DD) am amerikanischen Kalendertag (America/Los_Angeles —
// westlichste Venue-Zone, identisch zur Resolve-/Badge-Logik). Ein „Spieltag" =
// alle WM-Spiele desselben US-Tages; in Europa fällt ein Abendspiel sonst schon
// auf den nächsten Kalendertag und würde die Runde fälschlich aufteilen.
const US_TZ = 'America/Los_Angeles';
function usDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: US_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
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
  matchdayNetGain?: number;
  isTestPlayer?: boolean;
  isAdmin?: boolean;
}
interface Bet {
  playerId: string;
  marketId: string;
  amount: number;
  payout?: number;
}
interface Market {
  id: string;
  status: 'open' | 'locked' | 'resolved' | 'cancelled' | 'paused';
  marketSubtype?: string;
  kickoffAt?: number;
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

// ── WM-Fakten: zwei Pools, taeglich abwechselnd "alte" und "neue" Zeit ──
// Cordoba 1978 mehrfach drin, weil es fuer uns Oesterreicher DER Klassiker ist.
// 2026 wird absichtlich ausgelassen (die WM, die gerade laeuft).

const FAKTEN_ALT = [
  // — Die Wurzeln —
  '1930: Erste WM überhaupt — in Uruguay. Nur 13 Teams. Frankreich brauchte 19 Tage Schiffsfahrt zur Anreise.',
  '1934: Österreich wird Vierter — das beste WM-Ergebnis aller Zeiten. Das "Wunderteam" um Matthias Sindelar dominierte den europäischen Fußball.',
  '1942 und 1946: WM fällt aus — Weltkrieg. 12 Jahre Pause zwischen 1938 und 1950.',
  // — Schock-Momente —
  '1950: USA 1:0 England. Amerikanische Hobby-Kicker schlagen die Erfinder des Fußballs. Englische Zeitungen druckten "1:10" — sie hielten es für einen Tippfehler.',
  '1950: Maracanazo — Uruguay schlägt Brasilien im Endspiel vor 200.000 Fans im Maracana. In Brasilien wurden Selbstmorde gemeldet.',
  '1954: Das Wunder von Bern — Deutschland 3:2 gegen Ungarn, die zuvor 4 Jahre lang ungeschlagen waren. Helmut Rahn schoss das Tor, das ein Land aufrichtete.',
  '1954: Österreich wird Dritter — Platz drei nach 7:5 gegen die Schweiz im Viertelfinale, dem torreichsten WM-Spiel der Geschichte.',
  // — Legendäre Spieler —
  '1958: Just Fontaine erzielt 13 Tore in einer einzigen WM — bis heute Rekord. Er spielte mit zu engen Schuhen, weil seine kaputt gingen.',
  '1958: Pele wird WM-Sieger mit 17 Jahren. Bricht nach dem Finaltor in Tränen aus.',
  '1962: Brasilien wird Weltmeister, obwohl Pele verletzt ausfällt — Garrincha übernimmt im Alleingang.',
  '1966: Geoff Hurst trifft im Finale für England — sein 2:2 zum 3:2 nach Verlängerung ("Wembley-Tor") wird bis heute diskutiert. Ball drüber oder nicht?',
  '1970: Italien 4:3 gegen Deutschland im Halbfinale — "Jahrhundertspiel". Beckenbauer spielte die Verlängerung mit ausgekugelter Schulter.',
  '1970: Brasilien (Pele + Jairzinho + Tostao) gewinnt seine dritte WM und darf den Jules-Rimet-Pokal behalten. 1983 wurde dieser dann gestohlen.',
  '1974: Cruyff zeigt erstmals den nach ihm benannten "Cruyff-Turn" vs. Schweden. Der Verteidiger steht heute noch.',
  // — Cordoba (Österreich-Klassiker mehrfach) —
  '21. Juni 1978, Cordoba: Hans Krankl macht in der 88. Minute das 3:2 gegen Deutschland. Edi Finger wird narrisch. Erster Sieg gegen DE seit 47 Jahren.',
  '1978: Krankl wird Torschützenkönig der WM (6 Tore). Spielt anschließend bei Barcelona neben Cruyff — und kehrt nach Hause: "I wü hoam."',
  'Cordoba 1978: Der ORF-Kommentar "I werd narrisch" lief in Endlosschleife — Edi Finger sen. wurde zur Stimme einer Generation.',
  // — Skandale —
  '1982: "Nichtangriffspakt von Gijon" — Deutschland und Österreich einigten sich auf ein 1:0, das beide weiterbrachte. Algerien war schockiert raus. Seitdem werden letzte Gruppenspiele zeitgleich angepfiffen.',
  '1986: Maradona schießt gegen England binnen 4 Minuten zwei Tore — die "Hand Gottes" und das "Tor des Jahrhunderts" (Solo durch 6 Mann). Der Schiri hat das Handspiel nie gesehen.',
  '1986: Jose Batista (Uruguay) sieht nach 56 Sekunden Rot vs. Schottland — schnellster Platzverweis der WM-Geschichte.',
  // — 90er Drama —
  '1990: Andreas Brehme verwandelt den Finalelfer gegen Argentinien — auf dem Weg zum Punkt aß er ein Stückchen Brot. Sein Glückstalisman.',
  '1990: Kamerun erreicht als erste afrikanische Mannschaft das Viertelfinale. Roger Milla tanzt nach jedem Tor an der Eckfahne.',
  '1994: Roger Milla schießt mit 42 Jahren ein Tor — ältester Torschütze der WM-Geschichte.',
  '1994: Andres Escobar (Kolumbien) schießt ein Eigentor gegen die USA — 6 Tage später wird er in Medellin erschossen. Sein letzter Satz im Stadion: "Das Leben geht weiter."',
];

const FAKTEN_NEU = [
  // — 1998 —
  '1998: Ronaldo bricht Stunden vor dem Finale zusammen ("Krampfanfall"). Brasilien spielt trotzdem — Frankreich gewinnt 3:0. Bis heute Verschwörungstheorien.',
  '1998: Österreichs letzte WM vor 2026 — drei Spiele, drei Unentschieden, raus. Das 2:2 gegen Chile mit Polster-Tor war der einzige Lichtblick.',
  // — 2002 —
  '2002: Hakan Sukur (Türkei) erzielt nach 10,8 Sekunden gegen Südkorea das schnellste WM-Tor aller Zeiten.',
  '2002: Südkorea erreicht als erster Asiat das Halbfinale — nach umstrittenen Schiri-Entscheidungen gegen Italien und Spanien.',
  '2002: Senegal schlägt Titelverteidiger Frankreich 1:0 im Eröffnungsspiel. Frankreich scheidet ohne ein einziges Tor in der Vorrunde aus.',
  '2002: Oliver Kahn wird zum besten Spieler der WM gewählt — als einziger Torhüter aller Zeiten.',
  // — 2006 —
  '2006: Zinedine Zidane verpasst Materazzi im Finale einen Kopfstoß in die Brust und sieht Rot. Letztes Spiel seiner Karriere. Italien gewinnt im Elfmeterschießen.',
  '2006: "Sommermärchen" in Deutschland — keine zwischenfälle, perfekte Stimmung, drittes Platz für das Gastgeberland.',
  // — 2010 —
  '2010: Krake Paul aus Oberhausen tippt 8 von 8 Spielen richtig — inklusive Deutschlands Halbfinal-Niederlage gegen Spanien.',
  '2010: Erste WM in Afrika (Südafrika). Die Vuvuzelas waren so laut, dass FIFA die Lautstärke in TV-Übertragungen reduzieren musste.',
  '2010: Andres Iniesta erzielt das Finaltor für Spanien in der 116. Minute gegen Niederlande — Spaniens erster WM-Titel.',
  // — 2014 —
  '8. Juli 2014: Mineiraco — Deutschland 7:1 gegen Brasilien im Halbfinale. Höchste Niederlage Brasiliens jemals. 1:0 nach 11 Minuten, 5:0 nach 29 Minuten.',
  '2014: Mario Götze schießt Deutschland zum Titel — Einwechslung in der 88. Minute, Tor in der 113. Joachim Löw vor dem Einwechseln: "Zeig der Welt, dass du besser bist als Messi."',
  '2014: Tim Howard (USA) hält 16 Schüsse gegen Belgien — Rekord seit 1966. USA verlor trotzdem 1:2.',
  // — 2018 —
  '2018: Erste WM mit VAR. Russland mit den dunkelsten Wetten als Gastgeber — und wird überraschend Viertelfinalist.',
  '2018: Kroatien (4 Mio. Einwohner) erreicht erstmals das Finale. Luka Modric wird Weltfußballer, obwohl Kroatien verliert.',
  '2018: Deutschland scheidet als Titelverteidiger in der Vorrunde aus — letzter Platz hinter Schweden, Mexiko und Südkorea. "Korea raus, Deutschland zuhause." Zwei WMs hintereinander.',
  // — 2022 (verstärkt) —
  '2022: Erste Winter-WM. Erste WM in einem arabischen Land. Spiele um 22:00 Uhr Doha-Zeit wegen 35 Grad Hitze tagsüber.',
  '2022: Argentinien verliert das Eröffnungsspiel 1:2 gegen Saudi-Arabien — eine der größten Sensationen aller Zeiten. 36 Spiele in Folge ungeschlagen, beendet von einem 117. der Weltrangliste.',
  '2022: Marokko erreicht als erstes afrikanisches Team das WM-Halbfinale — schlägt Belgien, Spanien und Portugal auf dem Weg. Coach Walid Regragui: "Wir sind das Rocky der WM."',
  '2022: Japan schlägt im Gruppenspiel sowohl Deutschland als auch Spanien — und scheidet trotzdem als Gruppensieger erst im Achtelfinale aus.',
  '2022: WM-Finale Argentinien 3:3 Frankreich nach 120 Minuten — meistgesehenes Spiel der WM-Geschichte. Mbappe macht einen Hat-Trick im Finale (erster seit Hurst 1966) und verliert trotzdem.',
  '2022: Messi gewinnt mit 35 Jahren seine erste WM — in seinem 5. Anlauf. Älteste WM-Finaltorschütze aller Zeiten.',
  '2022: Cristiano Ronaldo trifft als erster Spieler bei FÜNF verschiedenen WMs (2006, 2010, 2014, 2018, 2022).',
  '2022: Argentiniens Torhüter Emi Martinez gewinnt Goldenen Handschuh — und sorgt mit zweideutigen Pokalfeiern weltweit für Schlagzeilen.',
];

function pickFakt(todayKey: string): string {
  // Tages-Hash, abwechselnd ALT/NEU nach Tag-Paritaet (Wiener Kalendertag).
  let h = 0;
  for (const c of todayKey) h = (h * 31 + c.charCodeAt(0)) | 0;
  const dayOfMonth = parseInt(todayKey.slice(8), 10) || 0;
  const pool = dayOfMonth % 2 === 0 ? FAKTEN_ALT : FAKTEN_NEU;
  return pool[Math.abs(h) % pool.length];
}

// ── Natuerlicher Countdown ─────────────────────────────────────────────────
// "morgen Abend", "am Donnerstagnachmittag" statt "in 2 Tagen und 22h".

function viennaHour(ms: number): number {
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: VIENNA_TZ, hour: '2-digit', hour12: false,
  }).format(new Date(ms)), 10);
}

function daysDiffVienna(fromMs: number, toMs: number): number {
  const fromUtc = Date.parse(viennaDayKey(fromMs) + 'T00:00:00Z');
  const toUtc   = Date.parse(viennaDayKey(toMs)   + 'T00:00:00Z');
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

// "abend" / "nachmittag" etc. fuer Komposition wie "Donnerstagabend".
function todPart(hour: number): { compact: string; spaced: string } {
  if (hour >= 5  && hour < 10) return { compact: 'morgen',     spaced: 'früh' };
  if (hour >= 10 && hour < 13) return { compact: 'vormittag',  spaced: 'Vormittag' };
  if (hour >= 13 && hour < 15) return { compact: 'mittag',     spaced: 'Mittag' };
  if (hour >= 15 && hour < 18) return { compact: 'nachmittag', spaced: 'Nachmittag' };
  if (hour >= 18 && hour < 22) return { compact: 'abend',      spaced: 'Abend' };
  return { compact: 'nacht', spaced: 'Nacht' };
}

function naturalCountdown(fromMs: number, toMs: number): string {
  const days = daysDiffVienna(fromMs, toMs);
  const hour = viennaHour(toMs);
  const { compact, spaced } = todPart(hour);
  const timeStr = viennaTime(toMs);
  const weekday = new Intl.DateTimeFormat('de-AT', {
    timeZone: VIENNA_TZ, weekday: 'long',
  }).format(new Date(toMs));

  if (days <= 0) return `heute ${spaced} (${timeStr})`;
  if (days === 1) return `morgen ${spaced} (${timeStr})`;
  if (days === 2) return `übermorgen ${spaced} (${timeStr})`;
  if (days <= 6) return `am ${weekday}${compact} (${timeStr})`;
  return `in ${days} Tagen — ${weekday} ${spaced} (${timeStr})`;
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

  // 2. Tagessieger / Pechvogel — Netto-Bilanz des aktuellen US-Spieltags,
  // on-the-fly aus den payout-Feldern der Bets berechnet (payout − Einsatz),
  // identisch zur In-App-Badge-Logik. Bewusst NICHT aus einem gespeicherten
  // Tagesfeld: dailyNetGain nullt der Reveal-Screen beim Ansehen, ein matchday-
  // Feld kann je nach Reset-/Schreib-Timing veraltet sein. Spieltag = alle
  // aufgelösten WM-Spiele desselben US-Tages (Tag des zuletzt angepfiffenen).
  const resolvedWm = markets.filter(
    (m: any) => m.marketSubtype === 'wm-match' && m.status === 'resolved' && typeof m.kickoffAt === 'number',
  );
  const matchdayNet: Record<string, number> = {};
  if (resolvedWm.length > 0) {
    const latest = Math.max(...resolvedWm.map((m: any) => m.kickoffAt as number));
    const key = usDayKey(latest);
    const ids = new Set(
      resolvedWm.filter((m: any) => usDayKey(m.kickoffAt as number) === key).map((m: any) => m.id),
    );
    for (const b of bets) {
      if (ids.has(b.marketId)) {
        matchdayNet[b.playerId] = (matchdayNet[b.playerId] ?? 0) + ((b.payout ?? 0) - (b.amount ?? 0));
      }
    }
  }
  const withGain = players
    .map(p => ({ name: p.name ?? '—', gain: Math.round(matchdayNet[p.id] ?? 0) }))
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

  // 4. Heutige Matches — gruppiert nach US-Spieltag (amerikanischer Kalendertag),
  // NICHT nach Wiener Tag: ein Spieltag läuft in den USA über einen Tag, in
  // Europa aber oft über zwei (z. B. 21:00 + 03:00 Folgetag). „Heute" meint die
  // ganze US-Runde; die Anzeige der Uhrzeiten bleibt Wiener Ortszeit.
  const todayUsKey = usDayKey(now);
  const tomorrowUsKey = usDayKey(now + 24 * 60 * 60 * 1000);
  const todayMatches = schedule
    .filter(m => usDayKey(m.kickoffAt) === todayUsKey)
    .filter(m => m.kickoffAt > now - 60 * 60 * 1000)
    .sort((a, b) => a.kickoffAt - b.kickoffAt);
  const tomorrowMatches = schedule
    .filter(m => usDayKey(m.kickoffAt) === tomorrowUsKey)
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
  const fakt = pickFakt(todayKey);

  // ─── A) Pre-Tournament-Modus ───────────────────────────────────────────
  if (!inTournament) {
    lines.push('🍺 *Willkommen, liebe Krügerl-Propheten!*');
    lines.push('Bald geht\'s endlich los — vorab wie immer ein WM-Fakt zum Glänzen am nächsten Stammtisch:');
    lines.push('');
    lines.push(`💡 _${fakt}_`);
    lines.push('');

    // Countdown bis erstes Spiel — natuerliche Formulierung
    if (earliestKickoff != null) {
      const first = schedule.find(s => s.kickoffAt === earliestKickoff)!;
      const when = naturalCountdown(now, earliestKickoff);
      lines.push(`⏰ Erstes Spiel ${when}:`);
      lines.push(`   *${first.teamA} vs. ${first.teamB}*`);
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
  lines.push('🍺 *Willkommen zurück, liebe Krügerl-Propheten!*');
  lines.push('Auch heute warten wieder spannende Spiele auf uns — davor aber wie immer ein WM-Fakt zum Glänzen am nächsten Stammtisch:');
  lines.push('');
  lines.push(`💡 _${fakt}_`);
  lines.push('');

  const hasRueckblick = !!(sieger || pech || ranked.length > 0);
  if (hasRueckblick) {
    lines.push(`📊 *Rückblick auf den letzten Spieltag (${dateStr}):*`);
    if (sieger) lines.push(`🏆 Tagessieger: *${sieger.name}* (+${fmtTKN(sieger.gain)} TKN)`);
    if (pech)   lines.push(`💀 Pechvogel:   *${pech.name}* (${fmtTKN(pech.gain)} TKN)`);
    if (ranked.length > 0) {
      lines.push('');
      lines.push('🏅 Top 3 Gesamt:');
      ranked.forEach((p, i) => {
        lines.push(`   ${i + 1}. ${p.name} — ${fmtTKN(p.total)} TKN`);
      });
    }
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
