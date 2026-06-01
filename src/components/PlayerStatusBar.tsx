import { BADGE_LABELS, type Player } from '../store';

// Schmale Statusleiste unter dem Charakter (Leaderboard / Spielerkarte).
// Priorität: DAMN HOT > ON FIRE > aktiver Streak (≥2) > aktives Badge > nichts.
export default function PlayerStatusBar({ player }: { player: Player }) {
  if (player.streakLevel === 'damn_hot') {
    return (
      <div className="bg-orange-600 text-white text-[9px] font-black text-center px-2 py-0.5 rounded-b-lg tracking-wide animate-[puls_1.5s_infinite]">
        🔥🔥 DAMN HOT
      </div>
    );
  }
  if (player.streakLevel === 'on_fire') {
    return (
      <div className="bg-orange-400 text-white text-[9px] font-black text-center px-2 py-0.5 rounded-b-lg tracking-wide">
        🔥 ON FIRE
      </div>
    );
  }
  if ((player.currentStreak ?? 0) >= 2) {
    return (
      <div className="bg-yellow/15 text-yellow text-[9px] font-bold text-center px-2 py-0.5 rounded-b-lg">
        {player.currentStreak}er Streak
      </div>
    );
  }
  if (player.activeBadgeId) {
    return (
      <div className="bg-white/5 text-muted text-[9px] font-bold text-center px-2 py-0.5 rounded-b-lg">
        {BADGE_LABELS[player.activeBadgeId]}
      </div>
    );
  }
  return null;
}
