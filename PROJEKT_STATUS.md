# Krügerl Propheten — WM 2026 Tippspiel · Projektstatus & offene To-dos

Stand: laufende Entwicklung. Diese Datei fasst den Gesamtstand zusammen und listet
**alle offenen Punkte präzise** auf. Arbeits-/Deploy-Branch: `claude/friendly-clarke-9bXc4`
(wird von Netlify deployt). Entwicklungsbranch: `claude/admin-market-bet-controls-BmF6T`.

---

## 1. Überblick

Privates WM-2026-Tippspiel (Spielgeld „Tokens", kein Echtgeld). Stack:
- **Frontend:** React + TypeScript + Vite + Zustand + Tailwind, gehostet auf **Netlify**.
- **Daten/Auth:** **Firebase** (Firestore + Auth).
- **Server-Jobs:** Netlify Scheduled Functions (`tick`, `auto-resolve`) + Admin-HTTP-Funktionen.
- **Ergebnis-API:** football-data.org (Free-Tier: WC + CL).
- **WhatsApp-Bot:** separater Node-Prozess (`wa-bot/`), läuft auf einem eigenen Rechner (noch nicht in Betrieb).

---

## 2. In dieser Session umgesetzt (erledigt ✅)

**Admin / Märkte**
- Märkte/Sonder-/Jackpot-Wetten **manuell schließen** mit Bestätigung; Gratis-Wetten: **Löschen oder Absagen** wählbar.
- **Eigene Gratis-Wette** erstellen (einsatzfrei, fester Haus-Preis; Jackpot-Prinzip).
- **Hausbank/Jackpot** manuell auf exakten Wert setzen.
- **Märkte pausieren** (für Spieler ausgeblendet) + **wieder öffnen**; zusätzlich „Sperren".
- **Multiple-Choice-Wetten** (Spieler kreuzt mehrere an, nur exakt richtig gewinnt) — in Gratis- und Einsatz-Creator.

**Auflösung (vereinheitlicht & atomar)**
- Alle Admin-Auflösungen laufen über den geschützten Server-Endpunkt `resolve-market`
  (`win`/`rollover`/`storno`/`open`) → einheitliche Logik (Streak/Underdog/Mindestgewinn/Feed), `FieldValue.increment` (keine Lost-Updates).

**Reveal**
- Täglicher **Bilanz-Reveal** (Full-Screen-Video `win.mp4`/`loss.mp4` + „+/− X TKN", Auto-Dismiss). Zahl erscheint nach **4,3 s**, Screen läuft bis **Videoende**.
- Test-Buttons im Admin (System → „🎬 Reveal testen": Gewinn/Verlust/Zufall).

**Charaktere / Accessoires**
- Charakter-Builder **aktiv** (`CHARACTER_MODE = 'builder'`): **Kopf → Outfit → Bestätigung**.
- Köpfe in 2 Kategorien: **Persönlichkeiten** (Standard) + **ASV** (Dateiname `ASV-…`, Anzeige nur nach dem `-`). Kategorie-Tabs.
- Kopf-Auswahl **zoomt** auf den Kopf (2×, mittig) — Vorschau + Miniaturen. Standard-Kopf: **„Toni"**.
- **Accessoire-System** (rein kosmetisch), 3 Slots (Kopf/Hand/Trikot) + Badge-Hintergrund. Profil-Auswahl, Ranglisten-Icons.
- **Auto-Vergabe:** 4er-Streak → `flames`, Underdog-Sieg → `underdog_medal`.
- Admin: **Block-Sieger küren** (z. B. Österreich-Trikot) + Accessoire manuell vergeben (Test).
- Bilder werden als **WebP** geladen; Dateinamen mit Leerzeichen via `encodeURIComponent`.

**Performance / Firestore-Reads**
- `tick`: nur Spiele im 48-h-Fenster lesen; Spieler nur bei Sperrung; Duplikat-Check via `matchId in`.
- `auto-resolve`: nur aktiv, wenn ein Markt auf ein Ergebnis wartet (sonst sofort raus, kein API-Call).
- Crons auf **alle 15 Min** (vorher tick jede Minute). **Wett-Schluss bei Anpfiff im Frontend** erzwungen.
- Spielplan einmalig laden (kein Live-Listener).

**Bugfixes (Code-Review)**
- RevealScreen: kein `setState` im Render mehr (Crash-Fix).
- IDs via `crypto.randomUUID()` (keine Kollisionen).
- `/admin` & `/cashout` nur für Admins.
- `changeBet` prüft `expiresAt` & `kickoffAt`.

**Sonstiges**
- App-Icon + PWA-Manifest (maskable) + „Zum Homescreen hinzufügen"-Button (Login).
- Golden-Test-Werkzeug für CL-Finale (echtes Spiel → Markt → Auto-Auflösung).

---

## 3. OFFENE TO-DOS

### 3.1 Assets noch hochladen (sonst Platzhalter/Emoji)
Alle als **transparente WebP, 1080×1080, vollflächig/deckungsgleich**.

- [ ] **Accessoires** → `public/overlays/accessories/` (Dateiname = ID):
  `underdog_medal.webp`, `flames.webp`, `crown_gold.webp`, `alpenmuetze.webp`,
  `jersey_at_gold.webp`, `jersey_finale.webp`, `trophy.webp`
- [ ] **Badges (Hintergrund)** → `public/overlays/badges/`:
  `on_fire.webp`, `damn_hot.webp` (optional weitere, siehe README im Ordner)
- [x] Köpfe (`public/characters/heads/`, 33) und Outfits (`public/characters/outfits/`, 34) — hochgeladen.
- [x] `public/win.mp4`, `public/loss.mp4`, `public/icon-512.png` — hochgeladen.

### 3.2 WhatsApp-Bot (noch nicht in Betrieb)
Plan: `wa-bot/WHATSAPP_BUSINESS_SETUP.md`. Offen:
- [ ] WhatsApp **Business** auf dem Handy mit der **Festnetznummer** registrieren (Anruf-Verifizierung).
- [ ] Business-Konto in die Ziel-Gruppe; **Gruppenlink** im Admin (System → WhatsApp) hinterlegen.
- [ ] Alten Laptop: Node ≥18, `cd wa-bot && npm install`, `service-account.json` ablegen (NICHT committen — ist in `.gitignore`).
- [ ] Bot verknüpfen (QR), `WA_GROUP_JID` aus Logs setzen, mit **pm2** dauerhaft starten.
- [ ] Test über Admin → „🧪 WhatsApp testen".
- [ ] Laptop: niemals schlafen; Handy ~alle 14 Tage online (sonst trennt WhatsApp das verknüpfte Gerät).

### 3.3 Konfiguration / Env / Firestore (verifizieren)
- [ ] **Netlify Env-Vars** gesetzt?
  - Frontend (Build): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
  - Functions: `FIREBASE_SERVICE_ACCOUNT` (JSON als ein String), `FOOTBALL_DATA_API_KEY`
  - Optional: `ADMIN_EMAILS` (Fallback im Code), `RESOLVE_COMPETITIONS` (Default `WC,CL`)
- [ ] **Firestore Rules** (`firestore.rules`) und **Indizes** (`firestore.indexes.json`) deployt.
- [ ] **Einladungscode** im Admin (System) gesetzt.
- [ ] Nach dem Turnierstart **Spielplan importieren** (Admin → System → „Spielplan laden"), sobald die API die WM-Fixtures liefert.

### 3.4 Tests vor Go-live (im Testmodus!)
- [ ] **Golden Test CL-Finale:** Admin → System → „CL-Spiele laden" (API-Test) → Markt erstellen → mit Test-Spielern tippen → nach Abpfiff Auto-Auflösung prüfen.
- [ ] **Reveal:** Videos hochgeladen → „🎬 Reveal testen" (Gewinn/Verlust). Ggf. `HOLD_MS`/`HEAD_ZOOM` etc. feinjustieren.
- [ ] **Registrierung (Builder):** Kopf-Kategorien, Zoom, Outfit, Bestätigung; Kopf+Körper-Überlagerung sauber?
- [ ] **Auflösungen:** Spezial-, Jackpot-, Normal-, Multiple-Choice-Wette + Rollover/Storno auflösen, Token-Stände & Feed prüfen.
- [ ] **Auto-Abzug:** Markt sperren → Nicht-Tipper verlieren Einsatz.
- [ ] **Accessoires/Block-Preise:** „Block-Sieger küren" + manuelles Vergeben → Anzeige im Charakter/Profil/Rangliste.
- [ ] **„Live gehen"** (Testmodus beenden) — Achtung: löscht alle Testdaten, behält Admins/Spielplan/Invite-Code.

### 3.5 Code-Verbesserungen (offen — empfohlen/optional)
- [ ] **Optimierung 2 — `bets` aufräumen** (empfohlen vor/während Turnier): aufgelöste Wetten archivieren/löschen, damit die `bets`-Collection nicht das ganze Turnier wächst und bei jedem App-Aufruf komplett gelesen wird (größter verbleibender Frontend-Read-Posten). **Im Testmodus gegenprüfen.**
- [ ] **Phasen-Einsatzlimits** konsolidieren: Min/Max je Phase werden im echten Wett-Flow teils umgangen (eigene Slider) statt über `phase.ts`/`BetSlider`.
- [ ] **Spieltagskönig → 👑 Krone** automatisch vergeben (aktuell nur manuell; käme aus der täglichen Auswertung).
- [ ] **„Freigeschaltet!"-Moment** im Reveal (Extra-Motivation bei neuem Accessoire).
- [ ] **Bestehende Spieler** auf Builder-Charakter migrieren (nur falls gewünscht; neue Registrierungen laufen bereits über Kopf+Körper).
- [ ] **Service Worker** (minimal, nicht-cachend) für nativen Android-Install-Dialog (bewusst weggelassen).
- [ ] Pre-existing: `tsconfig` schließt `netlify/` vom Typecheck aus (Functions werden nur beim Build/Deploy via esbuild gebündelt).

---

## 4. Pre-Go-Live-Checkliste (Kurzform)
1. [ ] Accessoire- & Badge-WebPs hochgeladen (3.1).
2. [ ] Env-Vars & Firestore Rules/Indizes verifiziert (3.3).
3. [ ] Golden-Test grün, Reveal getestet, Registrierung getestet (3.4).
4. [ ] (Optional) `bets`-Aufräumen umgesetzt (3.5).
5. [ ] WhatsApp-Bot eingerichtet & getestet (3.2) — optional, kann auch nachgereicht werden.
6. [ ] Spielplan importiert, Einladungscode gesetzt.
7. [ ] **„Live gehen"** drücken → echtes Turnier.

---

## 5. Bekannte Einschränkungen / Hinweise
- **Wirtschaft ist client-vertrauensbasiert:** Firestore-Rules erlauben jedem eingeloggten Nutzer Schreibzugriff auf Spieler-Dokumente → ein technisch versierter Mitspieler könnte sich Tokens gutschreiben. Für ein privates Spielgeld-Spiel akzeptiert; vollständige Absicherung wäre ein größerer serverseitiger Umbau.
- **Elfmeterschießen:** `auto-resolve` nutzt das reguläre Endergebnis der API → ein im Elfmeterschießen entschiedenes K.-o.-Spiel kann als „Unentschieden" auflösen.
- **Alte Combo-Markttypen** werden serverseitig nicht behandelt (vom aktuellen UI nicht mehr erzeugt; vor Go-live ohnehin Reset).
- **Reveal nur bei eigenen Wett-Ergebnissen** (reine Auto-Abzüge ohne Tipp lösen keinen Reveal aus).
- **Reads/Limit:** Server-Crons sind stark optimiert; größter verbleibender Hebel ist 3.5 (`bets`).
- **App-Icon:** als `maskable` deklariert; nach Manifest-Änderungen Icon vom Homescreen entfernen & neu hinzufügen (OS cached).
