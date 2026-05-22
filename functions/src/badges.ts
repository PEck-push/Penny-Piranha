/**
 * checkAndAwardBadges — called after every market resolution for each bettor.
 * Reads fresh player data and unlocks badges + awards hausbank bonuses.
 */

import * as admin from 'firebase-admin';

const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;

type BadgeId =
  | 'on_fire' | 'damn_hot' | 'whale' | 'bankrupt' | 'phoenix'
  | 'underdog' | 'phasekoenig' | 'tageskoenig' | 'arschkarte' | 'wunderteam';

const BADGE_HAUSBANK_BONUS: Partial<Record<BadgeId, number>> = {
  on_fire:  30,
  damn_hot: 100,
};

export async function checkAndAwardBadges(playerId: string): Promise<void> {
  const firestore = db();
  const playerRef = firestore.collection('players').doc(playerId);
  const appRef    = firestore.collection('appState').doc('global');

  const [playerSnap, appSnap] = await Promise.all([
    playerRef.get(),
    appRef.get(),
  ]);

  if (!playerSnap.exists) return;
  const player = playerSnap.data()!;
  const existing: string[] = player.unlockedOverlays ?? [];

  const toUnlock: BadgeId[] = [];

  if (player.streakLevel === 'on_fire'   && !existing.includes('on_fire'))   toUnlock.push('on_fire');
  if (player.streakLevel === 'damn_hot'  && !existing.includes('damn_hot'))  toUnlock.push('damn_hot');
  if (player.tokens === 0               && !existing.includes('bankrupt'))   toUnlock.push('bankrupt');
  if (player.underdogCorrect >= 3       && !existing.includes('underdog'))   toUnlock.push('underdog');
  if (player.austriaSpecialCorrect >= 2 && !existing.includes('wunderteam')) toUnlock.push('wunderteam');
  if (player.buybackUsed && (player.rank ?? 999) <= 10 && !existing.includes('phoenix')) toUnlock.push('phoenix');

  if (toUnlock.length === 0) return;

  const updates: Record<string, any> = {
    unlockedOverlays: FieldValue.arrayUnion(...toUnlock),
    activeBadgeId: toUnlock[toUnlock.length - 1], // most recent badge becomes active
  };

  let hausbankDelta = 0;
  for (const badge of toUnlock) {
    const bonus = BADGE_HAUSBANK_BONUS[badge];
    if (bonus) {
      updates.tokens = FieldValue.increment(bonus);
      hausbankDelta -= bonus;
    }
  }

  const batch = firestore.batch();
  batch.update(playerRef, updates);
  if (hausbankDelta !== 0) {
    batch.update(appRef, { hausbank: FieldValue.increment(hausbankDelta) });
  }

  // Feed entries for streak badges
  for (const badge of toUnlock) {
    if (badge === 'on_fire' || badge === 'damn_hot') {
      const feedRef = firestore.collection('feed').doc();
      batch.set(feedRef, {
        type: 'streak_' + badge,
        playerId,
        playerName: player.displayName ?? player.name ?? '?',
        text: badge === 'on_fire'
          ? `🔥 ${player.displayName ?? player.name} ist ON FIRE! 4er Streak!`
          : `🔥🔥 ${player.displayName ?? player.name} ist DAMN HOT! 7er Streak!`,
        creditsChange: BADGE_HAUSBANK_BONUS[badge] ?? 0,
        ts: FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

/**
 * awardDailyBadges — called by Cloud Scheduler at midnight.
 * Assigns SPIELTAGSKÖNIG and ARSCHKARTE, then resets dailyNetGain.
 */
export async function awardDailyBadges(): Promise<void> {
  const firestore = db();
  const playersSnap = await firestore.collection('players').get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  if (players.length === 0) return;

  const sorted = [...players].sort((a, b) => (b.dailyNetGain ?? 0) - (a.dailyNetGain ?? 0));
  const king   = sorted[0];
  const loser  = sorted[sorted.length - 1];

  const batch = firestore.batch();

  // SPIELTAGSKÖNIG
  if (king && (king.dailyNetGain ?? 0) > 0) {
    batch.update(firestore.collection('players').doc(king.id), {
      activeBadgeId: 'tageskoenig',
      unlockedOverlays: FieldValue.arrayUnion('tageskoenig'),
    });
    const feedRef = firestore.collection('feed').doc();
    batch.set(feedRef, {
      type: 'badge_unlocked',
      playerId: king.id,
      playerName: king.displayName ?? king.name ?? '?',
      text: `🏆 ${king.displayName ?? king.name} ist Spieltagskönig! +${king.dailyNetGain} Cr.`,
      creditsChange: king.dailyNetGain,
      ts: FieldValue.serverTimestamp(),
    });
  }

  // ARSCHKARTE
  if (loser && (loser.dailyNetGain ?? 0) < 0) {
    batch.update(firestore.collection('players').doc(loser.id), {
      activeBadgeId: 'arschkarte',
      unlockedOverlays: FieldValue.arrayUnion('arschkarte'),
    });
    const feedRef = firestore.collection('feed').doc();
    batch.set(feedRef, {
      type: 'badge_unlocked',
      playerId: loser.id,
      playerName: loser.displayName ?? loser.name ?? '?',
      text: `🃏 ${loser.displayName ?? loser.name} hat die Arschkarte! ${loser.dailyNetGain} Cr.`,
      creditsChange: loser.dailyNetGain,
      ts: FieldValue.serverTimestamp(),
    });
  }

  // Reset dailyNetGain for all players
  for (const p of players) {
    batch.update(firestore.collection('players').doc(p.id), { dailyNetGain: 0 });
  }

  await batch.commit();
}
