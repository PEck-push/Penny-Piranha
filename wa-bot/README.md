# Penny Piranha WhatsApp-Bot

Selbstplanender WhatsApp-Bot (Baileys). Kein offener Port, keine eingehenden
Verbindungen. Liest direkt aus Firestore und sendet zwei tägliche Nachrichten:

- **08:00 UTC (10:00 CEST):** Spielvorschau (heutige WM-Spiele)
- **07:00 UTC (09:00 CEST):** Tagesauswertung (Rangliste, Spieltagskönig, Streaks)

Außerdem: prüft alle 30s ob im Admin-Panel „WhatsApp testen" gedrückt wurde
(Feld `appState/global.waTestRequest`) und sendet dann eine Testnachricht.

## Benötigte Dateien / Variablen

| Was | Wie |
|-----|-----|
| `service-account.json` | Firebase Console → Projekteinstellungen → Dienstkonten → „Neuen privaten Schlüssel generieren" → Datei in diesen Ordner legen |
| `WA_GROUP_JID` (Env-Var) | JID der Zielgruppe; erscheint nach dem QR-Scan in den Logs |
| `APP_URL` (Env-Var, optional) | Standard: `https://penny-piranha.netlify.app` |

## Lokal / auf dem Server starten

```bash
npm install
WA_GROUP_JID=120363XXXXXXXXXX@g.us node index.js
```

Beim ersten Start erscheint ein QR-Code im Terminal → mit WhatsApp scannen
(Einstellungen → Verknüpfte Geräte → Gerät verknüpfen). Die Session wird in
`auth_info/` gespeichert und überlebt Neustarts.

## Dauerhaft laufen lassen (pm2)

```bash
npm install -g pm2
WA_GROUP_JID=120363XXXXXXXXXX@g.us pm2 start index.js --name penny-wa-bot
pm2 save
pm2 startup   # Befehl ausführen, den pm2 ausgibt → Bot startet nach Reboot automatisch
```

Logs ansehen: `pm2 logs penny-wa-bot`
