# Charakter-Köpfe (Builder-Modus, z-20)

Transparente **WebP**, Vorlage **1080×1080**, vollflächig/deckungsgleich (Kopf an der
richtigen Stelle, Rest transparent). Dateiname frei wählbar, z. B. `head_01.webp`.

Nur nötig im **Builder-Modus**. Aktivierung in `src/data/characterParts.ts`:
1. WebP-Dateien hier ablegen.
2. Dateinamen (ohne `.webp`) in `HEADS` eintragen.
3. `CHARACTER_MODE = 'builder'` setzen.

Solange `CHARACTER_MODE = 'fallback'` (Standard), werden die vorhandenen Avatare
aus `public/avatars/` genutzt und dieser Ordner ist ungenutzt.
