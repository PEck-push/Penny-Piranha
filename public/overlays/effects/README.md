# Auto-Status-Overlays (oberste Ebenen, automatisch vergeben)

Transparente **WebP**, Vorlage **1080×1080**, vollflächig/deckungsgleich zum
Charakter — das Teil an der richtigen Stelle platzieren, Rest transparent.
Werden **nicht** vom Spieler gewählt, sondern automatisch vom Spielstand
abgeleitet. Fehlt eine Datei, wird die Ebene einfach ausgeblendet (kein Fehler).

| Datei | Ebene | Auslöser |
|---|---|---|
| `leader_crown.webp` | z-45 (über allen Accessoires) | **Ranglisten-Erster** (höchstes Gesamtvermögen) — Pflicht-Ausstattung, wechselt automatisch mit der Führung |
| `tagessieger.webp`  | z-50 (ganz vorne)           | **Tagessieger** (höchster Tagesgewinn des Tages, > 0) |

Platzierung im 1080×1080-Raster:
- `leader_crown.webp`: Krone sitzt **oben mittig** auf dem Kopf (wie das
  hochgeladene Beispiel) — restliche Fläche transparent.
- `tagessieger.webp`: Medaille hängt z. B. **oben rechts** — restliche Fläche
  transparent, damit der Charakter sichtbar bleibt.
