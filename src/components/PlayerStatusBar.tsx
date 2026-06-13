import { type Player } from '../store';

// Schmale Statusleiste unter dem Charakter (Leaderboard / Spielerkarte).
// Alles direkt aus dem AKTUELLEN Streak abgeleitet, damit Badge und Streak nie
// auseinanderlaufen: DAMN HOT (≥7) > ON FIRE (≥4) > „Xer Streak" (≥2) > nichts.
export default function PlayerStatusBar({ player }: { player: Player }) {
  const streak = player.currentStreak ?? 0;
  if (streak >= 7) {
    return (
      <div className="bg-orange-600 text-white text-[9px] font-black text-center px-2 py-0.5 rounded-b-lg tracking-wide animate-[puls_1.5s_infinite]">
        🔥🔥 DAMN HOT
      </div>
    );
  }
  if (streak >= 4) {
    return (
      <div className="bg-orange-400 text-white text-[9px] font-black text-center px-2 py-0.5 rounded-b-lg tracking-wide">
        🔥 ON FIRE
      </div>
    );
  }
  if (streak >= 2) {
    return (
      <div className="bg-yellow/15 text-yellow text-[9px] font-bold text-center px-2 py-0.5 rounded-b-lg">
        {streak}er Streak
      </div>
    );
  }
  return null;
}
