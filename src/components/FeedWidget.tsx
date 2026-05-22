import { clsx } from 'clsx';
import { useStore, FeedEventType } from '../store';

const TYPE_ICON: Record<FeedEventType, string> = {
  bet_placed:           '🎯',
  market_resolved:      '✅',
  streak_on_fire:       '🔥',
  streak_damn_hot:      '🔥🔥',
  badge_unlocked:       '🏅',
  underdog_win:         '💪',
  phase_winner:         '👑',
  jackpot_distribution: '💰',
  buyback:              '🔄',
  market_locked:        '🔒',
};

const TYPE_COLOR: Record<FeedEventType, string> = {
  bet_placed:           'text-muted',
  market_resolved:      'text-green',
  streak_on_fire:       'text-orange-400',
  streak_damn_hot:      'text-orange-500',
  badge_unlocked:       'text-yellow',
  underdog_win:         'text-purple2',
  phase_winner:         'text-yellow',
  jackpot_distribution: 'text-yellow',
  buyback:              'text-blue2',
  market_locked:        'text-muted',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)  return 'jetzt';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

interface FeedWidgetProps {
  maxItems?: number;
  className?: string;
}

export default function FeedWidget({ maxItems = 5, className }: FeedWidgetProps) {
  const feed = useStore(s => s.feed);
  const items = feed.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <div className={clsx('bg-card border border-border rounded-[18px] p-4', className)}>
        <div className="text-[11px] font-black text-muted tracking-[0.1em] uppercase mb-3">
          📡 Activity Feed
        </div>
        <div className="text-[12px] text-muted/60 text-center py-4">
          Noch keine Aktivität
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-card border border-border rounded-[18px] p-4', className)}>
      <div className="text-[11px] font-black text-muted tracking-[0.1em] uppercase mb-3">
        📡 Activity Feed
      </div>
      <div className="flex flex-col gap-0">
        {items.map((event, i) => (
          <div
            key={event.id}
            className={clsx(
              'flex items-start gap-2.5 py-2',
              i < items.length - 1 && 'border-b border-border/60',
            )}
          >
            <span className="text-[16px] shrink-0 mt-0.5">
              {TYPE_ICON[event.type] ?? '📌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className={clsx('text-[12px] font-bold leading-snug', TYPE_COLOR[event.type])}>
                {event.text}
              </p>
              {event.creditsChange !== undefined && event.creditsChange !== 0 && (
                <span className={clsx(
                  'text-[10px] font-black',
                  event.creditsChange > 0 ? 'text-green' : 'text-red',
                )}>
                  {event.creditsChange > 0 ? '+' : ''}{event.creditsChange} Cr.
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted/50 shrink-0 mt-0.5">
              {timeAgo(event.ts)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
