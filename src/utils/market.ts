import type { Market } from '../store';

// Ist die Tippabgabe für diesen Markt gesperrt?
//
// „Gesperrt" heißt: es kann nicht mehr getippt/geändert werden — entweder weil
// der Cron-Tick den Markt schon auf 'locked'/'resolved'/'cancelled' gesetzt hat
// ODER weil der effektive Annahmeschluss (expliziter betCloseAt, sonst Anpfiff
// bzw. Hot-Take-Ablauf) bereits erreicht ist. So greift die Sperre punktgenau
// zum Anpfiff, auch wenn der Cron erst etwas später wirklich auf 'locked' stellt.
//
// 'paused' zählt NICHT als reguläre Sperre — der Markt ist dann nur vorüber-
// gehend ausgeblendet und kann vom Admin wieder geöffnet werden.
export const isBettingClosed = (m: Market | undefined, now = Date.now()): boolean => {
  if (!m) return false;
  if (m.status === 'locked' || m.status === 'resolved' || m.status === 'cancelled') return true;
  if (m.status === 'paused') return false;
  // status === 'open': zeitbasiert prüfen.
  const close = typeof m.betCloseAt === 'number'
    ? m.betCloseAt
    : typeof m.kickoffAt === 'number'
      ? m.kickoffAt
      : m.expiresAt;
  return typeof close === 'number' && close <= now;
};
