# Shop-Item-Grafiken

Transparente **WebP**, Vorlage **1080×1080**, vollflächig/deckungsgleich zum Charakter
(das Teil an der richtigen Stelle platzieren, Rest transparent). Dateiname = `<id>.webp`.

Die `id` kommt aus dem Admin-Panel beim Anlegen eines Shop-Items (a-z0-9_).

## z-Ebenen je Slot

| Slot | z-Index | Liegt über/unter |
|---|---|---|
| `background` | 5  | über dem Hintergrund-Badge |
| `torso`      | 13 | unter dem event-vergebenen Trikot |
| `hand`       | 28 | unter dem event-vergebenen Hand-Accessoire |
| `head`       | 38 | unter dem event-vergebenen Kopf-Accessoire |
| `effect`     | 55 | ganz oben (über Krone & Medaille) |

Shop-Items werden parallel zu den event-vergebenen Accessoires gerendert, sodass
beide gleichzeitig sichtbar getragen werden können.

## Fehlt eine Grafik

Solange die Datei fehlt, blendet `CharacterAvatar` die Ebene per `onError` aus.
Im Shop selbst zeigt die Karte solange das Emoji aus dem Item-Datensatz.
