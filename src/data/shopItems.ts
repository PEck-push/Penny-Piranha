// ─── Shop-Katalog: kaufbare Avatar-Items ──────────────────────────────────────
// Shop-Items werden mit Tokens gekauft (purchaseShopItem) und liegen danach im
// Player-Feld `shopInventory`. Sie haben EIGENE Slots, damit sie parallel zu
// den event-vergebenen Accessoires (ACCESSORIES) sichtbar bleiben — siehe
// CharacterAvatar.tsx (z-Ebenen 5, 13, 28, 38, 55).
//
// Der Katalog lebt in Firestore (`shopItems`) und wird vom Admin verwaltet. Die
// Definitionen unten dienen NUR als Initial-Saat („Beispiel-Items anlegen"),
// damit das System sofort befüllt startet, bis echte Items + Grafiken stehen.

export type ShopSlot = 'head' | 'hand' | 'torso' | 'effect' | 'background';

export interface ShopItem {
  id: string;
  label: string;
  description: string;
  slot: ShopSlot;
  icon: string;            // Emoji-Fallback (Shop-Karte, Profil-Inventar)
  price: number;           // Token-Preis
  imagePath?: string;      // Optionaler Pfad zur WebP (default: /shop/<id>.webp)
  available: boolean;      // Wird sofort als kaufbar angezeigt
  availableFrom?: number;  // Optional: Drop-Zeitpunkt (Unix ms)
  availableUntil?: number; // Optional: Ablauf (Unix ms)
  phase?: string;          // Optionaler Phasen-Tag (z.B. 'gruppenphase', 'achtelfinale')
  sortOrder?: number;      // Sortierung im Shop (kleinere Werte zuerst)
  createdAt: number;
}

export const SHOP_SLOT_LABELS: Record<ShopSlot, string> = {
  head:       'Kopf',
  hand:       'Hand',
  torso:      'Trikot',
  effect:     'Effekt',
  background: 'Hintergrund',
};

export const SHOP_SLOTS: { slot: ShopSlot; label: string }[] = [
  { slot: 'head',       label: 'Kopf' },
  { slot: 'torso',      label: 'Trikot' },
  { slot: 'hand',       label: 'Hand' },
  { slot: 'effect',     label: 'Effekt' },
  { slot: 'background', label: 'Hintergrund' },
];

// ── Beispiel-Saat: 5 Platzhalter-Items für sofortigen Test ────────────────────
// Wird vom Admin per Knopfdruck angelegt (siehe seedShopExamples im Store).
// Preise/Slots sind beliebig wählbar — der User legt später die echten Items an.
export const SHOP_EXAMPLE_ITEMS: Omit<ShopItem, 'createdAt'>[] = [
  {
    id: 'ex_sombrero',
    label: 'Sombrero',
    description: 'Klassischer Strohhut für Sonnenanbeter — Beispiel-Item.',
    slot: 'head',
    icon: '🤠',
    price: 150,
    available: true,
    sortOrder: 10,
  },
  {
    id: 'ex_jersey_rainbow',
    label: 'Regenbogen-Trikot',
    description: 'Schillerndes Trikot in voller Farbpracht — Beispiel-Item.',
    slot: 'torso',
    icon: '🌈',
    price: 250,
    available: true,
    sortOrder: 20,
  },
  {
    id: 'ex_beer_stein',
    label: 'Bierkrug',
    description: 'Frisch gezapft. Prost! — Beispiel-Item.',
    slot: 'hand',
    icon: '🍺',
    price: 200,
    available: true,
    sortOrder: 30,
  },
  {
    id: 'ex_sparkles',
    label: 'Glitzer-Aura',
    description: 'Funkelnder Effekt rund um deinen Charakter — Beispiel-Item.',
    slot: 'effect',
    icon: '✨',
    price: 400,
    available: true,
    sortOrder: 40,
  },
  {
    id: 'ex_stadium_bg',
    label: 'Stadion-Hintergrund',
    description: 'Volle Tribüne als Hintergrund — Beispiel-Item.',
    slot: 'background',
    icon: '🏟️',
    price: 350,
    available: true,
    sortOrder: 50,
  },
];

export const isShopItemAvailable = (item: ShopItem, now = Date.now()): boolean => {
  if (!item.available) return false;
  if (item.availableFrom && item.availableFrom > now) return false;
  if (item.availableUntil && item.availableUntil < now) return false;
  return true;
};

export const shopItemImagePath = (item: Pick<ShopItem, 'id' | 'imagePath'>): string =>
  item.imagePath ?? `/shop/${item.id}.webp`;
