import type { Player } from '../store';

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

// Vollflächige, deckungsgleiche Overlays (Designvorlage: 1080×1080, transparent).
// z-Reihenfolge (unten → oben):
//   0  Hintergrund-Badge (on_fire, damn_hot, Phasen-Badges)
//   10 Unterkörper / Outfit  (bzw. Fallback-Avatar = ganzer Charakter)
//   15 Trikot-Accessoire (optional)
//   20 Kopf (nur Builder-Modus)
//   30 Hand-Accessoire
//   40 Kopf-Accessoire
// Fehlt ein PNG noch, wird die jeweilige Ebene per onError ausgeblendet.
export default function CharacterAvatar({ player, size = 'md', className = '' }: Props) {
  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };
  const enc = encodeURIComponent; // Dateinamen mit Leerzeichen URL-sicher machen
  const acc = player.activeAccessories ?? {};

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
    </div>
  );
}
