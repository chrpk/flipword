import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  ACHIEVEMENT_TRACK_IDS,
  ACHIEVEMENT_TRACKS,
  achievementId,
  reachedAchievements,
  streaks,
} from "../../shared/achievements";
import { achievementsSeenInput } from "../../shared/schemas";
import { State } from "../../shared/srs";
import type { Achievements } from "../../shared/types";
import { clock, type AppEnv } from "../context";
import { achievement, card, gameSession, reviewLog } from "../db/schema";
import { dayIndexSql } from "../queries";

/** Rows per insert: D1 allows 100 bound parameters per statement, an achievement row has 4. */
const INSERT_CHUNK = 20;

export const achievements = new Hono<AppEnv>()
  /**
   * Progress on every track. Reading also records tiers reached since the last read, so achievements unlock however
   * the numbers changed (study, games, marking words learned, assistants).
   */
  .get("/", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const now = clock(c);

    const [days, words, reviews, games, existing] = await Promise.all([
      db
        .selectDistinct({ day: dayIndexSql(now, reviewLog.review) })
        .from(reviewLog)
        .where(eq(reviewLog.userId, userId)),
      db
        .select({ n: sql<number>`count(distinct ${card.noteId})` })
        .from(card)
        .where(
          and(
            eq(card.userId, userId),
            or(isNotNull(card.learnedAt), inArray(card.state, [State.Review, State.Relearning])),
          ),
        ),
      db.select({ n: sql<number>`count(*)` }).from(reviewLog).where(eq(reviewLog.userId, userId)),
      db.select({ n: sql<number>`count(*)` }).from(gameSession).where(eq(gameSession.userId, userId)),
      db.select().from(achievement).where(eq(achievement.userId, userId)),
    ]);

    const today = now.dayIndex(now.now);
    const streak = streaks(
      days.map((d) => d.day),
      today,
    );
    const values = {
      streak: streak.longest,
      words: words[0]?.n ?? 0,
      reviews: reviews[0]?.n ?? 0,
      games: games[0]?.n ?? 0,
    };

    const unlocked = new Map(existing.map((a) => [a.id, a]));
    const fresh = reachedAchievements(values)
      .filter((id) => !unlocked.has(id))
      .map((id) => ({ userId, id, unlockedAt: now.now, seenAt: null }));
    if (fresh.length) {
      const [first, ...rest] = Array.from({ length: Math.ceil(fresh.length / INSERT_CHUNK) }, (_, i) =>
        db
          .insert(achievement)
          .values(fresh.slice(i * INSERT_CHUNK, (i + 1) * INSERT_CHUNK))
          .onConflictDoNothing(),
      );
      await db.batch([first, ...rest]);
      for (const a of fresh) unlocked.set(a.id, a);
    }

    const tracks = ACHIEVEMENT_TRACK_IDS.map((track) => ({
      track,
      value: values[track],
      tiers: ACHIEVEMENT_TRACKS[track].map((goal) => {
        const id = achievementId(track, goal);
        return { id, goal, unlockedAt: unlocked.get(id)?.unlockedAt ?? null };
      }),
    }));
    // Oldest first; tiers unlocked together keep track and goal order.
    const unseen = tracks
      .flatMap((t) => t.tiers)
      .filter((tier) => tier.unlockedAt !== null && unlocked.get(tier.id)?.seenAt == null)
      .sort((a, b) => a.unlockedAt! - b.unlockedAt!)
      .map((tier) => tier.id);

    return c.json({
      tracks,
      currentStreak: streak.current,
      studiedToday: days.some((d) => d.day === today),
      unseen,
    } satisfies Achievements);
  })
  .post("/seen", zValidator("json", achievementsSeenInput), async (c) => {
    const { ids } = c.req.valid("json");
    if (ids.length) {
      await c
        .get("db")
        .update(achievement)
        .set({ seenAt: Date.now() })
        .where(and(eq(achievement.userId, c.get("userId")), inArray(achievement.id, ids), isNull(achievement.seenAt)));
    }
    return c.body(null, 204);
  });
