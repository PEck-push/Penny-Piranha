// ─── Accessoire-Katalog (rein kosmetisch) ─────────────────────────────────────
// Gegenstände werden durch Ereignisse freigeschaltet (unlockedOverlays) und je
// Slot getragen (activeAccessories). PNGs liegen unter
//   public/overlays/accessories/<id>.png
// und werden im Charakter über dem Body/Kopf gerendert. Solange ein PNG fehlt,
// wird es im Charakter ausgeblendet (onError) — in Listen/Profil dient das Emoji
// `icon` als Anzeige.

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
  { id: 'crown_gold',  label: 'Goldene Krone', slot: 'head', icon: '👑', desc: 'Spieltagskönig — höchster Tagesgewinn' },
  { id: 'flames',      label: 'Flammen',       slot: 'head', icon: '🔥', desc: 'On Fire — 4er-Streak' },
  { id: 'alpenmuetze', label: 'Alpenmütze',    slot: 'head', icon: '🧢', desc: 'Sieger im Österreich-Block', block: 'austria' },
  // ── Hand ──
  { id: 'trophy',         label: 'Pokal',          slot: 'hand', icon: '🏆', desc: 'Turniersieger (Endplatz 1)' },
  { id: 'underdog_medal', label: 'Underdog-Orden', slot: 'hand', icon: '🥇', desc: 'Underdog-Sieg (Außenseiter-Tipp)' },
  // ── Trikot ──
  { id: 'jersey_at_gold', label: 'Goldenes Österreich-Trikot', slot: 'torso', icon: '🇦🇹', desc: 'Sieger im Österreich-Block', block: 'austria' },
  { id: 'jersey_finale',  label: 'Finale-Trikot',              slot: 'torso', icon: '⭐', desc: 'Sieger im Finale-Block', block: 'finale' },
];

export const ACCESSORY_BY_ID: Record<string, Accessory> =
  Object.fromEntries(ACCESSORIES.map(a => [a.id, a]));

export const ACCESSORY_SLOTS: { slot: AccessorySlot; label: string }[] = [
  { slot: 'head',  label: 'Kopf' },
  { slot: 'hand',  label: 'Hand' },
  { slot: 'torso', label: 'Trikot' },
];
