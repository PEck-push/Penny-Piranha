// ─── Accessoire-Katalog (rein kosmetisch) ─────────────────────────────────────
// Gegenstände werden durch Ereignisse freigeschaltet (unlockedOverlays) und je
// Slot getragen (activeAccessories). PNGs liegen unter
//   public/overlays/accessories/<id>.webp
// und werden im Charakter über dem Body/Kopf gerendert. Solange ein PNG fehlt,
// wird es im Charakter ausgeblendet (onError) — in Listen/Profil dient das Emoji
// `icon` als Anzeige.
//
// Doppelungen sind bewusst entfernt:
//   - Spieltagskönig läuft als Auto-Effekt `tagessieger.webp` (z-50).
//   - 4er/7er-Streak laufen als Hintergrund-Badges `on_fire.webp` / `damn_hot.webp`.
//   - Turniersieger + Block-Trikots (Finale + AT-Gold) werden nicht umgesetzt;
//     der Österreich-Block-Sieg bleibt über die Alpenmütze sichtbar.

export type AccessorySlot = 'head' | 'hand' | 'torso';

export interface Accessory {
  id: string;
  label: string;
  slot: AccessorySlot;
  icon: string;        // Emoji-Fallback (Rangliste/Profil)
  desc: string;        // Wie freischalten (Anzeigetext)
  block?: 'block1' | 'austria' | 'block2' | 'finale'; // Block-Sieger-Preis
}

export const ACCESSORIES: Accessory[] = [
  // ── Kopf ──
  { id: 'alpenmuetze', label: 'Alpenmütze',    slot: 'head', icon: '🧢', desc: 'Sieger im Österreich-Block', block: 'austria' },
  // ── Hand ──
  { id: 'underdog_medal', label: 'Underdog-Orden', slot: 'hand', icon: '🥇', desc: 'Underdog-Sieg (Außenseiter-Tipp)' },
];

export const ACCESSORY_BY_ID: Record<string, Accessory> =
  Object.fromEntries(ACCESSORIES.map(a => [a.id, a]));

export const ACCESSORY_SLOTS: { slot: AccessorySlot; label: string }[] = [
  { slot: 'head',  label: 'Kopf' },
  { slot: 'hand',  label: 'Hand' },
  { slot: 'torso', label: 'Trikot' },
];
