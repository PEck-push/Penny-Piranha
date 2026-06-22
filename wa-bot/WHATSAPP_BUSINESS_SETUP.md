# WhatsApp-Bot via WhatsApp Business — Setup-Plan

> Status: **noch nicht umgesetzt** — Anleitung zum späteren Nachvollziehen.
> Voraussetzung-Hardware: alter Laptop (24/7 am Netz) + eigenes Smartphone.
> Bot-Nummer: ungenutzte **Festnetznummer** (Kabelplus-Tarif).

---

## Idee in einem Satz

Statt eines zweiten Smartphones nutzt du **WhatsApp Business** als *zweites,
getrenntes Konto* auf deinem eigenen Handy. Dieses Business-Konto läuft auf der
Festnetznummer und ist das „Haupt-Konto" des Bots. Der Laptop-Bot (Baileys)
klinkt sich als **verknüpftes Gerät** ein und sendet die täglichen Nachrichten.

```
Festnetznummer
   │  registriert
   ▼
WhatsApp Business (eigenes Handy)  ──Haupt-Konto──┐
   │                                              │ verknüpftes Gerät (QR)
   │ muss ~alle 14 Tage online sein               ▼
   └────────────────────────────────────►  Laptop-Bot (Baileys, pm2)
                                                   │ sendet 2× täglich
                                                   ▼
                                            WhatsApp-Gruppe
```

Dein **privates WhatsApp bleibt unberührt** — Business ist ein separates Konto
mit eigener Nummer in derselben App-Familie.

---

## Wichtig vorab

- **Zwei getrennte Konten auf einem Handy:** „WhatsApp" (privat, deine Nummer)
  und „WhatsApp Business" (Bot, Festnetznummer). Zwei verschiedene Apps, zwei
  verschiedene Nummern. Niemals dieselbe Nummer für beide.
- **Festnetz-Verifizierung:** WhatsApp versucht zuerst SMS. Nach dem Timeout auf
  „**Anrufen**" tippen — ein Automat ruft die Festnetznummer an und sagt den
  6-stelligen Code an. Einmal am Festnetz drangehen.
- **14-Tage-Regel:** Das Business-Konto (Haupt-Handy) muss ~alle 14 Tage einmal
  online gehen, sonst trennt WhatsApp den Laptop-Bot als verknüpftes Gerät.
- **Sperr-Risiko:** Baileys ist inoffiziell. Bei einer Sperre ist nur die
  Festnetznummer/das Business-Konto betroffen — egal, da ungenutzt.

---

## Schritt für Schritt

### 1. WhatsApp Business einrichten (Handy)
1. „WhatsApp Business" aus dem App-Store installieren (neben dem normalen WhatsApp).
2. Mit der **Festnetznummer** registrieren → SMS-Timeout abwarten → „Anrufen" →
   Code am Festnetz abhören und eingeben.
3. Minimal-Profil anlegen (Name z. B. „Penny Piranha WM 2026"). Keine weiteren
   Business-Features nötig.

### 2. Zielgruppe vorbereiten
- Entweder mit dem Business-Konto die **WhatsApp-Gruppe erstellen**, oder das
  Business-Konto in die bestehende Gruppe **einladen** (es muss Mitglied sein, um
  senden zu können).
- Den **Einladungslink** der Gruppe später im Admin-Panel hinterlegen
  (System → WhatsApp-Gruppe), damit neue Spieler beitreten können.

### 3. Laptop vorbereiten
1. Energieoptionen: **niemals schlafen**, „beim Zuklappen: nichts tun", am Strom lassen.
2. **Node.js LTS (≥18)** installieren.
3. Repo holen → `cd wa-bot && npm install`.
4. **Firebase-Schlüssel:** Firebase-Konsole → Projekteinstellungen → Dienstkonten
   → „Neuen privaten Schlüssel generieren" → Datei als `wa-bot/service-account.json`
   ablegen. (Wird von `wa-bot/.gitignore` ignoriert — niemals committen.)

### 4. Bot mit dem Business-Konto verknüpfen
1. Erststart am Laptop: `node index.js` → **QR-Code** erscheint im Terminal.
2. Auf dem Handy in **WhatsApp Business**: Einstellungen → **Verknüpfte Geräte**
   → „Gerät verknüpfen" → den QR-Code vom Laptop scannen.
3. In den Laptop-Logs erscheint die **Gruppen-JID** (`...@g.us`). Notieren.

### 5. Dauerbetrieb
1. Bot mit Gruppen-JID neu starten:
   `WA_GROUP_JID=120363XXXXXXXXXX@g.us node index.js`
2. Auf **pm2** umstellen (Auto-Neustart + nach Reboot) — siehe `wa-bot/README.md`:
   ```
   npm install -g pm2
   WA_GROUP_JID=120363XXXX@g.us pm2 start index.js --name penny-wa-bot
   pm2 save
   pm2 startup   # ausgegebenen Befehl ausführen
   ```
3. **Test:** App → Admin-Panel → System → „🧪 WhatsApp testen" → Nachricht muss in
   der Gruppe ankommen.

---

## Laufender Betrieb / Wartung

- Gelegentlich `pm2 logs penny-wa-bot` prüfen — es gibt **keine** automatische
  Ausfall-Warnung.
- Haupt-Handy (Business-Konto) ~alle 14 Tage online bringen.
- Bei Verbindungsverlust mit „logged out": Bot neu starten und QR erneut scannen.
- Tägliche Sendezeiten (in `wa-bot/index.js`, UTC):
  - `0 8 * * *` → 10:00 CEST Spielvorschau
  - `0 7 * * *` → 09:00 CEST Tagesauswertung

---

## Kosten

- WhatsApp Business: **0 €**
- Festnetznummer: bereits im Kabelplus-Tarif enthalten
- Hosting: alter Laptop zuhause, **0 €** (+ Strom)
- **Gesamt: ~0 €**

---

## Fallstricke (Checkliste)

- [ ] `service-account.json` **nicht** committet (per `.gitignore` abgesichert)
- [ ] Laptop schläft nicht / klappt nicht in Standby
- [ ] Business-Konto ist **Mitglied** der Zielgruppe
- [ ] `WA_GROUP_JID` korrekt gesetzt (aus den Logs)
- [ ] pm2 `startup` eingerichtet → Bot startet nach Stromausfall/Reboot neu
- [ ] Testnachricht erfolgreich empfangen
