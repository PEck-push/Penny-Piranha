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
let dailyCache: { players: Player[]; id: string } | null = null;
function memoDailyWinnerId(players: Player[]): string {
  if (dailyCache && dailyCache.players === players) return dailyCache.id;
  const id = computeDailyWinnerId(players);
  dailyCache = { players, id };
  return id;
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

function computeDailyWinnerId(players: Player[]): string {
  // Tagessieger = höchster Netto-Gewinn am aktuellen US-Spieltag. Quelle ist das
  // serverseitig gepflegte Feld `matchdayNetGain` (resolve.ts setzt es je Spieler
  // pro aufgelöstem Spiel und nullt es an der Spieltagsgrenze) — damit braucht der
  // immer sichtbare Tagessieger-Kranz KEINE ausgewerteten Tipps mehr im Client.
  // (Read-Optimierung: settled bets werden nicht mehr live gestreamt.)
  let bestId = '';
  let best = 0; // nur ein Tagessieger, wenn jemand echten Tagesgewinn (>0) hat
  for (const p of players) {
    const g = Math.round(p.matchdayNetGain ?? 0);
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
//   20 Kopf (Builder-Kopf ODER gekaufter Shop-Kopf — Austausch, nie beide)
//   28 Shop-Hand (kaufbar)
//   30 Hand-Accessoire (event-vergeben)
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
  const dailyWinnerId = useStore(s => memoDailyWinnerId(s.players));
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
  // Paket-Körper: trägt der Spieler einen Kopf, der einen eigenen Körper mitbringt
  // (z. B. Mundl-Paket), wird dieser Körper am Body-Layer (z-10) gezeigt. Ein
  // explizit getragenes Shop-Trikot hat Vorrang.
  const bundleBody = (() => {
    if (!shop.head || shop.torso) return null;
    const headItem = shopItems.find(s => s.id === shop.head);
    return headItem?.bundleBodyImage ?? null;
  })();

  return (
    <div className={`relative ${DIM[size]} ${className}`}>
      {/* z-0: Streak-Badge — direkt aus dem AKTUELLEN Streak abgeleitet (≥7
          damn_hot, ≥4 on_fire, sonst keins). Bewusst NICHT aus activeBadgeId,
          das veraltet sein kann. So passt das Badge immer zum echten Streak. */}
      {(() => {
        const cs = player.currentStreak ?? 0;
        const sb = cs >= 7 ? 'damn_hot' : cs >= 4 ? 'on_fire' : null;
        return sb ? (
          <img src={`/overlays/badges/${sb}.webp`} alt="" onError={hideOnError}
            className={`${overlay} z-0`} />
        ) : null;
      })()}

      {/* z-5: Shop-Hintergrund */}
      {shop.background && (
        <img src={shopSrc(shop.background)} alt="" onError={hideOnError} className={`${overlay} z-[5]`} />
      )}

      {/* z-10/20: Charakter-Basis — Körper und Kopf unabhängig (Kopf optional).
          Shop-Trikot ersetzt den Default-Körper komplett (bodyId wird dann nicht
          gerendert), damit das Trikot-Asset den ganzen Rumpf abdecken kann. */}
      {player.bodyId && !shop.torso && !bundleBody && (
        <img src={`/characters/outfits/${enc(player.bodyId)}.webp`} alt="" onError={hideOnError} className={`${overlay} z-[10]`} />
      )}
      {/* z-10: Paket-Körper (z. B. Mundl) ersetzt den Builder-Körper. */}
      {bundleBody && (
        <img src={bundleBody} alt="" onError={hideOnError} className={`${overlay} z-[10]`} />
      )}
      {/* Builder-Kopf — entfällt, sobald ein Shop-Kopf getragen wird (Austausch). */}
      {player.headId && !shop.head && (
        <img src={`/characters/heads/${enc(player.headId)}.webp`} alt={player.name} onError={hideOnError} className={`${overlay} z-20`} />
      )}
      {/* z-20: Shop-Kopf ersetzt den Builder-Kopf (gleiche Ebene, „Kopf-Austausch"). */}
      {shop.head && (
        <img src={shopSrc(shop.head)} alt={player.name} onError={hideOnError} className={`${overlay} z-20`} />
      )}
      {!player.bodyId && !player.headId && !shop.head && !bundleBody && (
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
      {/* z-30: Hand-Accessoire. underdog_medal ist hier ausgenommen — es ist kein
          dauerhaftes Accessoire mehr, sondern läuft als 24-h-Auto-Badge (z-33). */}
      {acc.hand && acc.hand !== 'underdog_medal' && (
        <img src={`/overlays/accessories/${acc.hand}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-30`} />
      )}
      {/* z-33: Underdog-Orden — Auto-Badge für 24 h ab dem Außenseiter-Sieg,
          unabhängig vom getragenen Hand-Accessoire. */}
      {!!player.underdogBadgeAt && (Date.now() - player.underdogBadgeAt) < 86_400_000 && (
        <img src="/overlays/accessories/underdog_medal.webp" alt="" onError={hideOnError}
          className={`${overlay} z-[33]`} />
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
