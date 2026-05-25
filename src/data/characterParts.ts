// ─── Charakter-System: Umschaltung + Bausteine ────────────────────────────────
//
// MODE steuert die Charakter-Auswahl bei der Registrierung:
//   'fallback' → 1 Schritt: einen vorhandenen Charakter aus public/avatars/ wählen.
//   'builder'  → 2 Schritte: Kopf (Schritt 1) + Outfit (Schritt 2) kombinieren.
//
// Vor Go-live, sobald die PNGs vorliegen:
//   1. Kopf-PNGs ablegen:   public/characters/heads/<id>.png
//   2. Outfit-PNGs ablegen: public/characters/outfits/<id>.png
//   3. Die <id> (Dateiname OHNE .png) unten in HEADS bzw. OUTFITS eintragen.
//   4. CHARACTER_MODE auf 'builder' setzen.
//
// Hinweis zu den PNGs: randlose, deckungsgleiche Vollbild-Ebenen mit Transparenz,
// damit der Kopf sauber über dem Outfit liegt (beide werden 1:1 überlagert).

export type CharacterMode = 'fallback' | 'builder';

// HIER vor Go-live auf 'builder' umstellen.
export const CHARACTER_MODE: CharacterMode = 'fallback';

// Dateinamen OHNE Endung. Reihenfolge = Anzeigereihenfolge im Auswahlraster.
// Beispiel: HEADS = ['head_01', 'head_02'] → public/characters/heads/head_01.png
export const HEADS: string[] = [];
export const OUTFITS: string[] = [];
