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

// Automatische Freischaltung anhand des importierten Spielplans. „Spieltag" =
// Kalendertag mit WM-Spielen (Europe/Vienna) — konsistent mit der Tagessieger-
// Logik. Freischaltung jeweils um 12:00 Ortszeit (Wien) an diesem Tag.
export type ShopUnlockRule =
  | { kind: 'fifaMatchday'; matchday: number } // FIFA-Spieltag (Gruppenrunde 1/2/3)
  | { kind: 'matchCalendarDay'; day: number }  // N-ter Kalendertag mit Spielen
  | { kind: 'afterGroupStage' };               // Tag nach dem letzten Gruppenspiel

export interface ShopItem {
  id: string;
  label: string;
  description: string;
  slot: ShopSlot;
  icon: string;            // Emoji-Fallback (Shop-Karte, Profil-Inventar)
  price: number;           // Token-Preis
  imagePath?: string;      // Optionaler Pfad zur WebP (default: /shop/<id>.webp)
  available: boolean;      // Wird sofort als kaufbar angezeigt
  availableFrom?: number;  // Optional: fester Drop-Zeitpunkt (Unix ms). Hat Vorrang.
  availableUntil?: number; // Optional: Ablauf (Unix ms)
  unlockRule?: ShopUnlockRule; // Automatische Freischaltung aus dem Spielplan
  unlockLabel?: string;    // Anzeigetext, solange gesperrt (z.B. „Ab dem 1. Spieltag")
  stock?: number;          // Globale Stückzahl (Knappheit). Fehlt = unbegrenzt.
  sold?: number;           // Bereits verkaufte Stück (atomar in der Kauf-Tx erhöht)
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

// ── Erste echte Item-Charge ───────────────────────────────────────────────────
// Alle vier sind „Hand"-Slot, links platziert (NICHT der Underdog-Bereich rechts).
// Grafiken als transparente WebP nach public/shop/<id>.webp legen.
//   schwechi  → günstig, 6 Stück (6er Tragerl), ab Start
//   pegasus   → rare, 1 Stück, Freischaltung nach dem 1. Spieltag
//   mrs_voiti → rare, 1 Stück, Freischaltung nach dem 4. Spieltag
//   dua       → rare, 2 Stück, Freischaltung nach der Gruppenphase
// Freischaltung läuft automatisch über unlockRule (aus dem Spielplan, 12:00 Wien).
// Bis zum Freischalt-Zeitpunkt sind die Items sichtbar + anprobierbar, aber nicht
// kaufbar. unlockLabel dient als Anzeigetext, solange der Spielplan noch fehlt.
export const SHOP_FIRST_ITEMS: Omit<ShopItem, 'createdAt'>[] = [
  {
    id: 'schwechi',
    label: 'Schwechi',
    description: 'Eine kühle Dose Schwechater für die Hand. Recht hat er! 🍺',
    slot: 'hand',
    icon: '🍺',
    price: 120,
    available: true,
    stock: 6,
    sold: 0,
    sortOrder: 10,
  },
  {
    id: 'pegasus',
    label: 'Pegasus',
    description: 'Silberner Pferdekopf — edel und extrem selten. Nur einer bekommt ihn.',
    slot: 'hand',
    icon: '🐎',
    price: 900,
    available: true,
    unlockRule: { kind: 'fifaMatchday', matchday: 1 },
    unlockLabel: 'Ab dem 1. Spieltag',
    stock: 1,
    sold: 0,
    sortOrder: 20,
  },
  {
    id: 'mrs_voiti',
    label: 'Mrs. Voiti',
    description: 'Die legendäre lila Sternchen-Ente. Einzelstück — wer zuerst kommt …',
    slot: 'hand',
    icon: '🦆',
    price: 900,
    available: true,
    unlockRule: { kind: 'fifaMatchday', matchday: 2 },
    unlockLabel: 'Ab dem 2. Spieltag',
    stock: 1,
    sold: 0,
    sortOrder: 30,
  },
  {
    id: 'dua',
    label: 'Dua',
    description: 'Lebensgroßer Dua-Aufsteller an deiner Seite. Nur zweimal verfügbar.',
    slot: 'hand',
    icon: '💃',
    price: 750,
    available: true,
    unlockRule: { kind: 'afterGroupStage' },
    unlockLabel: 'Nach der Gruppenphase',
    stock: 2,
    sold: 0,
    sortOrder: 40,
  },
];

export const isShopItemAvailable = (item: ShopItem, now = Date.now()): boolean => {
  if (!item.available) return false;
  if (item.availableFrom && item.availableFrom > now) return false;
  if (item.availableUntil && item.availableUntil < now) return false;
  return true;
};

// Verbleibende Stückzahl (null = unbegrenzt).
export const shopItemStockLeft = (item: Pick<ShopItem, 'stock' | 'sold'>): number | null =>
  item.stock == null ? null : Math.max(0, item.stock - (item.sold ?? 0));

export const isShopItemSoldOut = (item: Pick<ShopItem, 'stock' | 'sold'>): boolean =>
  shopItemStockLeft(item) === 0;

// ── Automatische Freischaltung aus dem Spielplan ──────────────────────────────
// Minimaler Spielplan-Eintrag, den die Berechnung braucht.
interface ScheduleLike { kickoffAt: number; phase?: string; matchday?: number | null }

const VIENNA_TZ = 'Europe/Vienna';
// Kalendertag (YYYY-MM-DD) eines Zeitpunkts in Wiener Ortszeit. Bei ungültigem
// Zeitstempel (NaN/null) → '' statt Exception (Intl wirft sonst bei Invalid Date).
const viennaDayKey = (ms: number): string => {
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: VIENNA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch { return ''; }
};
// 12:00 Ortszeit (Wien) eines Kalendertags als UTC-ms. Das WM-Fenster (Juni/Juli)
// liegt komplett in der Sommerzeit (CEST = UTC+2), daher 12:00 Wien = 10:00 UTC.
const viennaNoonUtc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d, 10, 0, 0);

// Berechnet den Freischalt-Zeitpunkt (UTC-ms) einer Regel aus dem Spielplan.
// null = noch nicht berechenbar (Spielplan fehlt / zu wenige Tage / ungültig).
// Komplett crash-sicher: niemals eine Exception aus dem Render heraus.
export const computeShopUnlockTs = (rule: ShopUnlockRule, schedule: ScheduleLike[]): number | null => {
  try {
    const valid = (schedule ?? []).filter(m => m && Number.isFinite(m.kickoffAt));
    if (valid.length === 0) return null;
    if (rule.kind === 'fifaMatchday') {
      const ks = valid.filter(m => m.matchday === rule.matchday).map(m => m.kickoffAt);
      if (ks.length === 0) return null;
      const key = viennaDayKey(Math.min(...ks));
      if (!key) return null;
      const [y, m, d] = key.split('-').map(Number);
      return viennaNoonUtc(y, m, d);
    }
    if (rule.kind === 'matchCalendarDay') {
      const days = Array.from(new Set(valid.map(m => viennaDayKey(m.kickoffAt)).filter(Boolean))).sort();
      const key = days[rule.day - 1];
      if (!key) return null;
      const [y, m, d] = key.split('-').map(Number);
      return viennaNoonUtc(y, m, d);
    }
    // afterGroupStage: Tag NACH dem letzten Gruppenspiel, 12:00 Wien.
    const groupMs = valid.filter(m => (m.phase ?? 'gruppenphase') === 'gruppenphase').map(m => m.kickoffAt);
    if (groupMs.length === 0) return null;
    const lastKey = viennaDayKey(Math.max(...groupMs));
    if (!lastKey) return null;
    const [y, m, d] = lastKey.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)); // rollt sauber über Monatsgrenzen
    return viennaNoonUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  } catch {
    return null;
  }
};

// Effektiver Freischalt-Zeitpunkt eines Items (oder null, wenn keine Zeit-Sperre):
// fester availableFrom hat Vorrang, sonst die Spielplan-Regel. Hat das Item eine
// Regel, die (noch) nicht berechenbar ist, gilt es als gesperrt (großer Wert).
export const shopUnlockAt = (item: ShopItem, schedule: ScheduleLike[]): number | null => {
  if (item.availableFrom) return item.availableFrom;
  if (item.unlockRule) return computeShopUnlockTs(item.unlockRule, schedule) ?? Number.MAX_SAFE_INTEGER;
  return null;
};

// Ist das Item jetzt kaufbar (inkl. Spielplan-Regel)?
export const isShopItemUnlocked = (item: ShopItem, schedule: ScheduleLike[], now = Date.now()): boolean => {
  if (!item.available) return false;
  if (item.availableUntil && item.availableUntil < now) return false;
  const at = shopUnlockAt(item, schedule);
  return at == null || at <= now;
};

// Item wird im Shop angezeigt (sichtbar+anprobierbar), auch wenn noch gesperrt:
// kaufbar jetzt, oder kommt noch (Datum/Regel/Event), oder bereits im Besitz.
export const isShopItemListed = (item: ShopItem, owned = false, now = Date.now()): boolean => {
  if (owned) return true;
  if (isShopItemAvailable(item, now)) return true;
  if (item.availableFrom && item.availableFrom > now) return true;
  if (item.unlockRule) return true;
  if (!item.available && item.unlockLabel) return true;
  return false;
};

export const shopItemImagePath = (item: Pick<ShopItem, 'id' | 'imagePath'>): string =>
  item.imagePath ?? `/shop/${item.id}.webp`;
