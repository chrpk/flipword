/**
 * Achievements: milestones on four tracks. Each tier unlocks once its goal is reached and stays unlocked, even if the
 * number later drops (an undone answer, a deleted deck).
 */
export const ACHIEVEMENT_TRACKS = {
  /** Longest run of consecutive days with at least one study review. */
  streak: [3, 7, 14, 30, 60, 100, 180, 365],
  /** Words marked as learned or graduated from learning steps (either direction). */
  words: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  /** Study answers, all time. */
  reviews: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000],
  /** Finished games. */
  games: [1, 10, 25, 50, 100, 250, 500],
} as const satisfies Record<string, readonly number[]>;

export type AchievementTrack = keyof typeof ACHIEVEMENT_TRACKS;

export const ACHIEVEMENT_TRACK_IDS = Object.keys(ACHIEVEMENT_TRACKS) as AchievementTrack[];

/** Stable id stored per unlocked achievement, e.g. "streak-7". */
export function achievementId(track: AchievementTrack, goal: number) {
  return `${track}-${goal}`;
}

export function parseAchievementId(id: string): { track: AchievementTrack; goal: number } | null {
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  if (!m || !Object.hasOwn(ACHIEVEMENT_TRACKS, m[1])) return null;
  const track = m[1] as AchievementTrack;
  const goal = Number(m[2]);
  return (ACHIEVEMENT_TRACKS[track] as readonly number[]).includes(goal) ? { track, goal } : null;
}

/** Ids of every tier whose goal `values` reach. */
export function reachedAchievements(values: Record<AchievementTrack, number>) {
  return ACHIEVEMENT_TRACK_IDS.flatMap((track) =>
    ACHIEVEMENT_TRACKS[track].filter((goal) => values[track] >= goal).map((goal) => achievementId(track, goal)),
  );
}

/**
 * Current and longest streak from the day indexes that had activity. The current streak still counts when today has
 * no activity yet but yesterday had (the day isn't over).
 */
export function streaks(days: Iterable<number>, today: number) {
  const set = new Set(days);
  let current = 0;
  for (let d = set.has(today) ? today : today - 1; set.has(d); d--) current++;

  let longest = 0;
  for (const d of set) {
    if (set.has(d - 1)) continue; // not the start of a run
    let length = 1;
    while (set.has(d + length)) length++;
    longest = Math.max(longest, length);
  }
  return { current, longest };
}
