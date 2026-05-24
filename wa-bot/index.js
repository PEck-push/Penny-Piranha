import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import express from 'express';
import qrcode from 'qrcode';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const AUTH_DIR = path.join(__dirname, 'auth_info');
const PORT = process.env.PORT || 3000;
const WA_SECRET = process.env.WA_SECRET || '';
const WA_GROUP_JID = process.env.WA_GROUP_JID || '';

let sock = null;
let currentQR = null;
let connectionState = 'disconnected';

function authMiddleware(req, res, next) {
  if (!WA_SECRET) return next();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== WA_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      connectionState = 'qr';
      console.log('[WA] QR-Code bereit — mit WhatsApp scannen');
    }

    if (connection === 'open') {
      currentQR = null;
      connectionState = 'connected';
      console.log('[WA] Verbunden');
      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('[WA] Bekannte Gruppen (JIDs):');
        Object.entries(groups).forEach(([jid, g]) => console.log(`  ${jid}  "${g.subject}"`));
      } catch (e) {
        console.warn('[WA] Gruppen konnten nicht geladen werden:', e.message);
      }
    }

    if (connection === 'close') {
      connectionState = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('[WA] Verbindung getrennt, reconnect:', shouldReconnect, 'statusCode:', statusCode);
      if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// POST /send  { text: string }
app.post('/send', authMiddleware, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!WA_GROUP_JID) return res.status(500).json({ error: 'WA_GROUP_JID not set' });
  if (connectionState !== 'connected' || !sock) {
    return res.status(503).json({ error: `WhatsApp nicht verbunden (state: ${connectionState})` });
  }
  try {
    await sock.sendMessage(WA_GROUP_JID, { text });
    res.json({ ok: true });
  } catch (err) {
    console.error('[WA] Send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /qr-status — gibt QR-Code als Base64 zurück (einmalig beim Setup)
app.get('/qr-status', authMiddleware, async (req, res) => {
  if (connectionState === 'connected') return res.json({ connected: true });
  if (!currentQR) return res.json({ connected: false, qr: null, state: connectionState });
  try {
    const qrDataUrl = await qrcode.toDataURL(currentQR);
    res.json({ connected: false, qr: qrDataUrl, state: connectionState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, state: connectionState }));

connectToWhatsApp().catch(err => console.error('[WA] Init-Fehler:', err));
app.listen(PORT, () => console.log(`[Server] Port ${PORT}`));
