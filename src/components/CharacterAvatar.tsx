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

// Composite-Avatar: Body-Sprite + Kopf-Sprite + optionale Accessoire-/Badge-Overlays.
// Fällt auf das bestehende `avatar`-Bild zurück solange keine Charakter-Sprites
// (headId/bodyId) gesetzt sind — so bleibt der Bestand sichtbar.
export default function CharacterAvatar({ player, size = 'md', className = '' }: Props) {
  const hasCharacter = Boolean(player.headId && player.bodyId);

  return (
    <div className={`relative ${DIM[size]} ${className}`}>
      {hasCharacter ? (
        <>
          <img
            src={`/characters/outfits/${player.bodyId}.png`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain z-[10]"
          />
          <img
            src={`/characters/heads/${player.headId}.png`}
            alt={player.name}
            className="absolute inset-0 w-full h-full object-contain z-30"
          />
        </>
      ) : player.avatar ? (
        <img
          src={player.avatar}
          alt={player.name}
          className="absolute inset-0 w-full h-full object-contain z-[10]"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full rounded-full bg-white/5" />
      )}

      {/* Accessoire-Slots (rein kosmetisch). Fehlt das PNG noch, wird es per
          onError ausgeblendet, damit kein „kaputtes Bild"-Icon erscheint. */}
      {player.activeAccessories?.torso && (
        <img
          src={`/overlays/accessories/${player.activeAccessories.torso}.png`}
          alt=""
          onError={e => { e.currentTarget.style.display = 'none'; }}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[21]"
        />
      )}
      {player.activeAccessories?.head && (
        <img
          src={`/overlays/accessories/${player.activeAccessories.head}.png`}
          alt=""
          onError={e => { e.currentTarget.style.display = 'none'; }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-2/3 object-contain pointer-events-none z-[31]"
        />
      )}
      {player.activeAccessories?.hand && (
        <img
          src={`/overlays/accessories/${player.activeAccessories.hand}.png`}
          alt=""
          onError={e => { e.currentTarget.style.display = 'none'; }}
          className="absolute bottom-0 right-0 w-1/3 h-1/3 object-contain pointer-events-none z-[32]"
        />
      )}
      {player.activeBadgeId && (
        <img
          src={`/overlays/badges/${player.activeBadgeId}.png`}
          alt=""
          className="absolute top-0 right-0 w-1/4 h-1/4 object-contain pointer-events-none"
        />
      )}
    </div>
  );
}
