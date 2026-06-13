import { useStore, type Player, type Bet, type Market } from '../store';
import { shopItemImagePath } from '../data/shopItems';

interface Props {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const DIM: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-40 h-40',
};

// ── Auto-Status (nicht wählbar, vom Spielstand abgeleitet) ─────────────────────
// Ranglisten-Erster = höchstes Gesamtvermögen (Tokens + Einsätze in offenen
// Märkten — identisch zur Rangliste). Tagessieger = höchster Tagesgewinn (>0).
// Beide liefern eine ID (oder ''), damit Zustand-Selektoren nur bei echtem
// Wechsel ein Re-Render auslösen (primitiver Rückgabewert).
//
// Memo-Caches: bei 40+ Spielern werden diese Funktionen für JEDEN Avatar bei
// JEDEM Store-Change neu ausgewertet (O(players × bets) pro Avatar). Der Cache
// vergleicht Array-Referenzen — Zustand liefert bei jedem set() neue Refs, aber
// genau dann muss die Berechnung auch wirklich neu laufen. Innerhalb desselben
// Snapshots aber teilen sich alle Avatare das Ergebnis.
let leaderCache: { players: Player[]; bets: Bet[]; markets: Market[]; id: string } | null = null;
function memoLeaderId(players: Player[], bets: Bet[], markets: Market[]): string {
  if (
    leaderCache
    && leaderCache.players === players
    && leaderCache.bets === bets
    && leaderCache.markets === markets
  ) return leaderCache.id;
  const id = computeLeaderId(players, bets, markets);
  leaderCache = { players, bets, markets, id };
  return id;
}
let dailyCache: { players: Player[]; bets: Bet[]; markets: Market[]; id: string } | null = null;
function memoDailyWinnerId(players: Player[], bets: Bet[], markets: Market[]): string {
  if (
    dailyCache
    && dailyCache.players === players
    && dailyCache.bets === bets
    && dailyCache.markets === markets
  ) return dailyCache.id;
  const id = computeDailyWinnerId(players, bets, markets);
  dailyCache = { players, bets, markets, id };
  return id;
}

// US-Spieltag-Schlüssel (America/Los_Angeles) — identisch zur Server-Logik, damit
// alle Spiele eines amerikanischen Kalendertags zusammengehören.
function usDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

function computeLeaderId(players: Player[], bets: Bet[], markets: Market[]): string {
  // „Offen" für die Gesamtvermögens-Berechnung: noch nicht aufgelöst, d.h.
  // status='open' (Wett-Phase) oder status='locked' (Spiel läuft).
  const openMarkets = new Set(markets.filter(m => m.status === 'open' || m.status === 'locked').map(m => m.id));
  const openStake: Record<string, number> = {};
  for (const b of bets) {
    if (openMarkets.has(b.marketId)) openStake[b.playerId] = (openStake[b.playerId] ?? 0) + b.amount;
  }
  let bestId = '';
  let best = -Infinity;
  for (const p of players) {
    const total = (p.tokens ?? 0) + (openStake[p.id] ?? 0);
    if (total > best) { best = total; bestId = p.id; }
  }
  return bestId;
}

function computeDailyWinnerId(players: Player[], bets: Bet[], markets: Market[]): string {
  // Tagessieger = höchster Netto-Gewinn am AKTUELLEN US-Spieltag, on-the-fly aus
  // den persistierten payout-Feldern der Bets berechnet (payout − Einsatz).
  // Bewusst KEIN gespeichertes Tagesfeld: dailyNetGain nullt der Reveal-Screen
  // beim Ansehen, und ein separates matchday-Feld kann je nach Reset-/Schreib-
  // Timing veralten. Die Live-Berechnung ist immer korrekt und deckungsgleich
  // mit der Morgen-Summary.
  const resolvedWm = markets.filter(
    m => m.marketSubtype === 'wm-match' && m.status === 'resolved' && typeof m.kickoffAt === 'number',
  );
  if (resolvedWm.length === 0) return '';
  const latest = Math.max(...resolvedWm.map(m => m.kickoffAt as number));
  const key = usDayKey(latest);
  const ids = new Set(
    resolvedWm.filter(m => usDayKey(m.kickoffAt as number) === key).map(m => m.id),
  );
  const net: Record<string, number> = {};
  for (const b of bets) {
    if (ids.has(b.marketId)) net[b.playerId] = (net[b.playerId] ?? 0) + ((b.payout ?? 0) - (b.amount ?? 0));
  }
  let bestId = '';
  let best = 0; // nur ein Tagessieger, wenn jemand echten Tagesgewinn (>0) hat
  for (const p of players) {
    const g = net[p.id] ?? 0;
    if (g > best) { best = g; bestId = p.id; }
  }
  return bestId;
}

// Vollflächige, deckungsgleiche Overlays (Designvorlage: 1080×1080, transparent).
// z-Reihenfolge (unten → oben):
//   0  Hintergrund-Badge (on_fire, damn_hot, Phasen-Badges)
//   5  Shop-Hintergrund (kaufbar)
//   10 Unterkörper / Outfit  (bzw. Fallback-Avatar = ganzer Charakter)
//   13 Shop-Trikot (kaufbar)
//   15 Trikot-Accessoire (event-vergeben)
//   20 Kopf (nur Builder-Modus)
//   28 Shop-Hand (kaufbar)
//   30 Hand-Accessoire (event-vergeben)
//   38 Shop-Kopf (kaufbar)
//   40 Kopf-Accessoire (event-vergeben)
//   45 Leader-Krone (automatisch: Ranglisten-Erster)
//   50 Tagessieger-Medaille (automatisch: höchster Tagesgewinn)
//   55 Shop-Effekt (kaufbar) — ganz vorne
// Shop-Items haben EIGENE Ebenen → sie werden parallel zu den event-vergebenen
// Accessoires sichtbar getragen. Fehlt ein PNG, wird die Ebene per onError
// ausgeblendet.
export default function CharacterAvatar({ player, size = 'md', className = '' }: Props) {
  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };
  const enc = encodeURIComponent; // Dateinamen mit Leerzeichen URL-sicher machen
  const acc = player.activeAccessories ?? {};
  const shop = player.activeShopItems ?? {};

  // Abgeleitete Auto-Status (primitive IDs → minimale Re-Renders).
  // Berechnung läuft via Modul-Memo nur einmal pro neuem Store-Snapshot — egal
  // wie viele Avatare gleichzeitig im Tree sind.
  const leaderId = useStore(s => memoLeaderId(s.players, s.bets, s.markets));
  const dailyWinnerId = useStore(s => memoDailyWinnerId(s.players, s.bets, s.markets));
  const isLeader = !!leaderId && player.id === leaderId;
  const isDailyWinner = !!dailyWinnerId && player.id === dailyWinnerId;

  const overlay = 'absolute inset-0 w-full h-full object-contain pointer-events-none';
  // Shop-Items koennen einen abweichenden imagePath haben (z. B. wenn die
  // Asset-Datei anders heisst als die Item-ID — siehe nicos_astln →
  // oberarme.webp). Wir holen den Pfad aus dem live shopItems-State.
  const shopItems = useStore(s => s.shopItems);
  const shopSrc = (id: string) => {
    const it = shopItems.find(s => s.id === id);
    return it ? shopItemImagePath(it) : `/shop/${id}.webp`;
  };

  return (
    <div className={`relative ${DIM[size]} ${className}`}>
      {/* z-0: Hintergrund-Badge */}
      {player.activeBadgeId && (
        <img src={`/overlays/badges/${player.activeBadgeId}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-0`} />
      )}

      {/* z-5: Shop-Hintergrund */}
      {shop.background && (
        <img src={shopSrc(shop.background)} alt="" onError={hideOnError} className={`${overlay} z-[5]`} />
      )}

      {/* z-10/20: Charakter-Basis — Körper und Kopf unabhängig (Kopf optional).
          Shop-Trikot ersetzt den Default-Körper komplett (bodyId wird dann nicht
          gerendert), damit das Trikot-Asset den ganzen Rumpf abdecken kann. */}
      {player.bodyId && !shop.torso && (
        <img src={`/characters/outfits/${enc(player.bodyId)}.webp`} alt="" onError={hideOnError} className={`${overlay} z-[10]`} />
      )}
      {player.headId && (
        <img src={`/characters/heads/${enc(player.headId)}.webp`} alt={player.name} onError={hideOnError} className={`${overlay} z-20`} />
      )}
      {!player.bodyId && !player.headId && (
        player.avatar
          ? <img src={player.avatar} alt={player.name} referrerPolicy="no-referrer" className={`${overlay} z-[10]`} />
          : <div className="absolute inset-0 w-full h-full rounded-full bg-white/5" />
      )}

      {/* z-10: Shop-Trikot ersetzt den Default-Körper (gleiche Ebene wie Outfit). */}
      {shop.torso && (
        <img src={shopSrc(shop.torso)} alt="" onError={hideOnError} className={`${overlay} z-[10]`} />
      )}
      {/* z-15: Trikot-Accessoire */}
      {acc.torso && (
        <img src={`/overlays/accessories/${acc.torso}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-[15]`} />
      )}
      {/* z-28: Shop-Hand */}
      {shop.hand && (
        <img src={shopSrc(shop.hand)} alt="" onError={hideOnError} className={`${overlay} z-[28]`} />
      )}
      {/* z-30: Hand-Accessoire */}
      {acc.hand && (
        <img src={`/overlays/accessories/${acc.hand}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-30`} />
      )}
      {/* z-33: Underdog-Orden — temporäres Auto-Badge (bis zum nächsten Spieltag),
          unabhängig vom getragenen Hand-Accessoire. */}
      {player.underdogBadge && (
        <img src="/overlays/accessories/underdog_medal.webp" alt="" onError={hideOnError}
          className={`${overlay} z-[33]`} />
      )}
      {/* z-38: Shop-Kopf */}
      {shop.head && (
        <img src={shopSrc(shop.head)} alt="" onError={hideOnError} className={`${overlay} z-[38]`} />
      )}
      {/* z-40: Kopf-Accessoire */}
      {acc.head && (
        <img src={`/overlays/accessories/${acc.head}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-40`} />
      )}

      {/* z-45: Leader-Krone (Pflicht-Ausstattung des Ranglisten-Ersten) */}
      {isLeader && (
        <img src="/overlays/effects/leader_crown.webp" alt="" onError={hideOnError}
          className={`${overlay} z-[45]`} />
      )}
      {/* z-50: Tagessieger-Medaille (höchster Tagesgewinn) */}
      {isDailyWinner && (
        <img src="/overlays/effects/tagessieger.webp" alt="" onError={hideOnError}
          className={`${overlay} z-[50]`} />
      )}
      {/* z-55: Shop-Effekt — ganz vorne */}
      {shop.effect && (
        <img src={shopSrc(shop.effect)} alt="" onError={hideOnError} className={`${overlay} z-[55]`} />
      )}
    </div>
  );
}
