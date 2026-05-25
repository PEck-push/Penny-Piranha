import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import cron from 'node-cron';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'auth_info');
const WA_GROUP_JID = process.env.WA_GROUP_JID || '';
const APP_URL = process.env.APP_URL || 'https://penny-piranha.netlify.app';

// ── Firebase Admin ──────────────────────────────────────────────────────────
// Lädt service-account.json aus dem wa-bot-Ordner, oder aus der Env-Var
// FIREBASE_SERVICE_ACCOUNT (JSON als ein String).
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const file = path.join(__dirname, 'service-account.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  throw new Error('Kein Service-Account gefunden (service-account.json oder FIREBASE_SERVICE_ACCOUNT).');
}

admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
const db = admin.firestore();

// ── WhatsApp (Baileys) ────────────────────────────────────────────────────────
let sock = null;
let ready = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA] Bitte diesen QR-Code mit WhatsApp scannen:\n');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n(WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen)\n');
    }

    if (connection === 'open') {
      ready = true;
      console.log('[WA] Verbunden ✓');
      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('[WA] Bekannte Gruppen (JIDs):');
        Object.entries(groups).forEach(([jid, g]) => console.log(`  ${jid}  "${g.subject}"`));
      } catch (e) {
        console.warn('[WA] Gruppenliste nicht ladbar:', e.message);
      }
    }

    if (connection === 'close') {
      ready = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      console.log('[WA] Verbindung getrennt. Reconnect:', reconnect, '(code', code + ')');
      if (reconnect) setTimeout(connectToWhatsApp, 5000);
      else console.log('[WA] Ausgeloggt — bitte Bot neu starten und QR erneut scannen.');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function sendToGroup(text) {
  if (!WA_GROUP_JID) { console.error('[WA] WA_GROUP_JID nicht gesetzt.'); return; }
  if (!ready || !sock) { console.warn('[WA] Noch nicht verbunden — Nachricht übersprungen.'); return; }
  await sock.sendMessage(WA_GROUP_JID, { text });
  console.log('[WA] Nachricht gesendet.');
}

// ── Nachricht 1: Spielvorschau (heutige Spiele) ──────────────────────────────
async function sendPreview() {
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const snap = await db.collection('schedule')
    .where('kickoffAt', '>=', dayStart)
    .where('kickoffAt', '<', dayEnd)
    .orderBy('kickoffAt', 'asc')
    .get();

  if (snap.empty) { console.log('[Preview] Heute keine Spiele.'); return; }

  const lines = snap.docs.map(d => {
    const m = d.data();
    const dt = new Date(m.kickoffAt + 2 * 60 * 60 * 1000); // CEST
    const h = String(dt.getUTCHours()).padStart(2, '0');
    const min = String(dt.getUTCMinutes()).padStart(2, '0');
    return `⚽ ${h}:${min}  ${m.teamA} vs. ${m.teamB}`;
  });

  await sendToGroup(["🏆 WM 2026 – Heute's Spiele", '', ...lines, '', `Jetzt tippen → ${APP_URL}`].join('\n'));
}

// ── Nachricht 2: Tagesauswertung ─────────────────────────────────────────────
async function sendSummary() {
  const playersSnap = await db.collection('players').get();
  if (playersSnap.empty) { console.log('[Summary] Keine Spieler.'); return; }

  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const real = players.filter(p => !p.isTestPlayer);

  if (real.length > 0) {
    const sorted = [...real].sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0));
    const gains = real.map(p => ({
      name: p.displayName ?? p.name ?? '?',
      gain: (p.tokens ?? 0) - (p.tokensAtDayStart ?? (p.tokens ?? 0)),
    })).sort((a, b) => b.gain - a.gain);

    if (gains.some(g => g.gain !== 0)) {
      const medals = ['🏆', '🥈', '🥉'];
      const top3 = sorted.slice(0, 3)
        .map((p, i) => `${medals[i]} ${p.displayName ?? p.name ?? '?'} ${p.tokens ?? 0}`)
        .join(' · ');

      const top = gains[0];
      const low = gains[gains.length - 1];
      const onFire = real
        .filter(p => p.streakLevel === 'on_fire' || p.streakLevel === 'damn_hot')
        .map(p => `${p.displayName ?? p.name ?? '?'} (${p.currentStreak ?? 0}er)`)
        .join(' · ');

      const lines = ['📊 WM 2026 – Tagesauswertung', '', top3];
      if (top && top.gain > 0) lines.push(`🔥 Spieltagskönig: ${top.name} (+${top.gain} TKN)`);
      if (low && low.gain < 0) lines.push(`💸 Arschkarte: ${low.name} (${low.gain} TKN)`);
      if (onFire) lines.push(`🔥 On Fire: ${onFire}`);

      await sendToGroup(lines.join('\n'));
    } else {
      console.log('[Summary] Keine Aktivität gestern.');
    }
  }

  // tokensAtDayStart-Snapshot für die nächste Auswertung setzen
  for (let i = 0; i < players.length; i += 500) {
    const batch = db.batch();
    players.slice(i, i + 500).forEach(p => {
      batch.update(db.collection('players').doc(p.id), { tokensAtDayStart: p.tokens ?? 0 });
    });
    await batch.commit();
  }
}

// ── Test-Trigger: Admin-Button setzt appState/global.waTestRequest = Date.now()
let lastTestSeen = 0;
async function pollTestRequest() {
  try {
    const doc = await db.collection('appState').doc('global').get();
    const t = doc.data()?.waTestRequest ?? 0;
    if (t > lastTestSeen) {
      lastTestSeen = t;
      await sendToGroup('🧪 Test-Nachricht von Penny Piranha WM 2026 – alles ok!');
    }
  } catch (e) {
    console.warn('[Test-Poll] Fehler:', e.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  // Beim Start aktuellen Test-Stand merken, damit kein Alt-Trigger feuert.
  try {
    const doc = await db.collection('appState').doc('global').get();
    lastTestSeen = doc.data()?.waTestRequest ?? 0;
  } catch { /* ignore */ }

  await connectToWhatsApp();

  // Cron-Zeiten in UTC. 08:00 UTC = 10:00 CEST, 07:00 UTC = 09:00 CEST.
  cron.schedule('0 8 * * *', () => sendPreview().catch(e => console.error('[Preview]', e)), { timezone: 'Etc/UTC' });
  cron.schedule('0 7 * * *', () => sendSummary().catch(e => console.error('[Summary]', e)), { timezone: 'Etc/UTC' });

  // Test-Trigger alle 30s prüfen.
  setInterval(pollTestRequest, 30000);

  console.log('[Bot] Läuft. Cron 08:00/07:00 UTC aktiv, Test-Poll alle 30s.');
}

main().catch(e => { console.error('[Bot] Fataler Fehler:', e); process.exit(1); });
