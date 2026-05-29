import { useStore, type Player, type Bet, type Market } from '../store';

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
function computeLeaderId(players: Player[], bets: Bet[], markets: Market[]): string {
  const openMarkets = new Set(markets.filter(m => m.status === 'open').map(m => m.id));
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
  let bestId = '';
  let best = 0; // nur ein Tagessieger, wenn jemand echten Tagesgewinn (>0) hat
  for (const p of players) {
    const g = p.dailyNetGain ?? 0;
    if (g > best) { best = g; bestId = p.id; }
  }
  return bestId;
}

// Vollflächige, deckungsgleiche Overlays (Designvorlage: 1080×1080, transparent).
// z-Reihenfolge (unten → oben):
//   0  Hintergrund-Badge (on_fire, damn_hot, Phasen-Badges)
//   10 Unterkörper / Outfit  (bzw. Fallback-Avatar = ganzer Charakter)
//   15 Trikot-Accessoire (optional)
//   20 Kopf (nur Builder-Modus)
//   30 Hand-Accessoire
//   40 Kopf-Accessoire
//   45 Leader-Krone (automatisch: Ranglisten-Erster)
//   50 Tagessieger-Medaille (automatisch: höchster Tagesgewinn) — ganz vorne
// Fehlt ein PNG noch, wird die jeweilige Ebene per onError ausgeblendet.
export default function CharacterAvatar({ player, size = 'md', className = '' }: Props) {
  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };
  const enc = encodeURIComponent; // Dateinamen mit Leerzeichen URL-sicher machen
  const acc = player.activeAccessories ?? {};

  // Abgeleitete Auto-Status (primitive IDs → minimale Re-Renders).
  const leaderId = useStore(s => computeLeaderId(s.players, s.bets, s.markets));
  const dailyWinnerId = useStore(s => computeDailyWinnerId(s.players));
  const isLeader = !!leaderId && player.id === leaderId;
  const isDailyWinner = !!dailyWinnerId && player.id === dailyWinnerId;

  const overlay = 'absolute inset-0 w-full h-full object-contain pointer-events-none';

  return (
    <div className={`relative ${DIM[size]} ${className}`}>
      {/* z-0: Hintergrund-Badge */}
      {player.activeBadgeId && (
        <img src={`/overlays/badges/${player.activeBadgeId}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-0`} />
      )}

      {/* z-10/20: Charakter-Basis — Körper und Kopf unabhängig (Kopf optional). */}
      {player.bodyId && (
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

      {/* z-15: Trikot-Accessoire */}
      {acc.torso && (
        <img src={`/overlays/accessories/${acc.torso}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-[15]`} />
      )}
      {/* z-30: Hand-Accessoire */}
      {acc.hand && (
        <img src={`/overlays/accessories/${acc.hand}.webp`} alt="" onError={hideOnError}
          className={`${overlay} z-30`} />
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
      {/* z-50: Tagessieger-Medaille (höchster Tagesgewinn) — ganz vorne */}
      {isDailyWinner && (
        <img src="/overlays/effects/tagessieger.webp" alt="" onError={hideOnError}
          className={`${overlay} z-[50]`} />
      )}
    </div>
  );
}
