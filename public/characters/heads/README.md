# Charakter-Köpfe (Builder-Modus, z-20)

Transparente **PNG**, Vorlage **1080×1080**, vollflächig/deckungsgleich (Kopf an der
richtigen Stelle, Rest transparent). Dateiname frei wählbar, z. B. `head_01.png`.

Nur nötig im **Builder-Modus**. Aktivierung in `src/data/characterParts.ts`:
1. PNGs hier ablegen.
2. Dateinamen (ohne `.png`) in `HEADS` eintragen.
3. `CHARACTER_MODE = 'builder'` setzen.

Solange `CHARACTER_MODE = 'fallback'` (Standard), werden die vorhandenen Avatare
aus `public/avatars/` genutzt und dieser Ordner ist ungenutzt.
