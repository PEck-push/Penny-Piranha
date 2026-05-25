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
            className="absolute inset-0 w-full h-full object-contain"
          />
          <img
            src={`/characters/heads/${player.headId}.png`}
            alt={player.name}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </>
      ) : player.avatar ? (
        <img
          src={player.avatar}
          alt={player.name}
          className="absolute inset-0 w-full h-full object-contain"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full rounded-full bg-white/5" />
      )}

      {player.activeAccessoryId && (
        <img
          src={`/overlays/accessories/${player.activeAccessoryId}.png`}
          alt=""
          className="absolute bottom-0 right-0 w-1/3 h-1/3 object-contain pointer-events-none"
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
