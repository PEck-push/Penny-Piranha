# Accessoire-Overlays

Transparente **WebP**, Vorlage **1080×1080**, vollflächig/deckungsgleich zum Charakter
(das Teil an der richtigen Stelle platzieren, Rest transparent). Dateiname = `<id>.webp`.

| Datei | Slot | Auslöser |
|---|---|---|
| `alpenmuetze.webp` | Kopf | Österreich-Block-Sieger |
| `underdog_medal.webp` | Hand | Underdog-Sieg (automatisch) |

Die IDs stammen aus `src/data/accessories.ts` — neue Accessoires dort ergänzen.

## Bewusst nicht umgesetzt (Doppelungen)

- **Spieltagskönig** wird über den Auto-Effekt `overlays/effects/tagessieger.webp`
  (z-50, Medaille oben rechts) dargestellt — kein zusätzliches Kopf-Accessoire nötig.
- **4er-/7er-Streak** laufen über die Hintergrund-Badges
  `overlays/badges/on_fire.webp` und `damn_hot.webp` — kein Kopf-Flammen-Accessoire nötig.
- **Turniersieger** (Pokal), **Österreich-Block-Trikot** (gold) und **Finale-Trikot**
  sind aus der App entfernt.
