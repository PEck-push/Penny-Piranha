// ─── Charakter-System: Umschaltung + Bausteine ────────────────────────────────
//
// MODE steuert die Charakter-Auswahl bei der Registrierung:
//   'fallback' → 1 Schritt: einen vorhandenen Charakter aus public/avatars/ wählen.
//   'builder'  → 2 Schritte: Kopf (Schritt 1) + Outfit (Schritt 2) kombinieren.
//
// Vor Go-live, sobald die WebP-Dateien vorliegen:
//   1. Kopf-WebPs ablegen:   public/characters/heads/<id>.webp
//   2. Outfit-WebPs ablegen: public/characters/outfits/<id>.webp
//   3. Die <id> (Dateiname OHNE .webp) unten in HEADS bzw. OUTFITS eintragen.
//   4. CHARACTER_MODE auf 'builder' setzen.
//
// Hinweis zu den Dateien: randlose, deckungsgleiche Vollbild-Ebenen mit Transparenz,
// damit der Kopf sauber über dem Outfit liegt (beide werden 1:1 überlagert).

export type CharacterMode = 'fallback' | 'builder';

// HIER vor Go-live auf 'builder' umstellen.
export const CHARACTER_MODE: CharacterMode = 'builder';

// Dateinamen OHNE Endung. Reihenfolge = Anzeigereihenfolge im Auswahlraster.
// Beispiel: HEADS = ['head_01', 'head_02'] → public/characters/heads/head_01.webp
//
// Kopf-Kategorien (nur Anzeige in der Auswahl):
//   • Standard "Persönlichkeiten": normaler Dateiname, z. B. 'messi'
//   • "ASV": Dateiname beginnt mit 'ASV-', z. B. 'ASV-mueller' → angezeigt "Mueller"
export const HEADS: string[] = [
  'ASV-1000 TT', 'ASV-Bombi', 'ASV-Coach', 'ASV-Dejo', 'ASV-Franzi', 'ASV-Michi', 'ASV-Zobo',
  'Albert', 'Alf', 'Andrea', 'Diego', 'Edgar', 'Falco', 'Fraunz', 'Gianni Pace', 'Gigi',
  'Konfetti', 'Lemmy', 'Oli', 'Pele', 'Peppi Skandaloso', 'Roberto', 'Ronaldinho', 'Ronaldo',
  'Ruud', 'Salt', 'Schneckerl', 'Sigi', 'Toni', 'Tsubasa', 'Woiferl', 'Zauner', 'Zinedine',
];
export const OUTFITS: string[] = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013',
  '014', '015', '015-1', '016', '017', '018', '019', '021', '022', '023', '025', '028', '029',
  '032', '033', '034', '035', '039', '040', '041', '042',
];
