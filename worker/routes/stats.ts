import { and, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { streaks } from "../../shared/achievements";
import { Rating, State } from "../../shared/srs";
import type { Stats } from "../../shared/types";
import { clock, type AppEnv } from "../context";
import { card, reviewLog } from "../db/schema";
import { dayIndexSql } from "../queries";

const HISTORY_DAYS = 30;
const CALENDAR_DAYS = 365;
const FORECAST_DAYS = 14;
const STREAK_LOOKBACK_DAYS = 3650;

export const stats = new Hono<AppEnv>().get("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const now = clock(c);
  const today = now.dayIndex(now.now);
  const dayOf = (col: typeof reviewLog.review | typeof card.due) => dayIndexSql(now, col);

  const historyStart = now.dayStart(today - HISTORY_DAYS + 1);
  const forecastEnd = now.dayStart(today + FORECAST_DAYS);

  const [daily, reviewDays, totals, forecast, states, learned] = await Promise.all([
    db
      .select({
        day: dayOf(reviewLog.review),
        reviews: sql<number>`count(*)`,
        again: sql<number>`coalesce(sum(${reviewLog.rating} = ${Rating.Again}), 0)`,
        durationMs: sql<number>`coalesce(sum(${reviewLog.durationMs}), 0)`,
      })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), gte(reviewLog.review, historyStart)))
      .groupBy(sql`1`),
    // Reviews per day for the streak and the activity calendar; only needs the (user_id, review) index.
    db
      .select({ day: dayOf(reviewLog.review), reviews: sql<number>`count(*)` })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), gte(reviewLog.review, now.dayStart(today - STREAK_LOOKBACK_DAYS))))
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`),
    db
      .select({
        total: sql<number>`count(*)`,
        matureAnswers: sql<number>`coalesce(sum(${reviewLog.state} = ${State.Review} and ${reviewLog.review} >= ${historyStart}), 0)`,
        matureAgain: sql<number>`coalesce(sum(${reviewLog.state} = ${State.Review} and ${reviewLog.review} >= ${historyStart} and ${reviewLog.rating} = ${Rating.Again}), 0)`,
      })
      .from(reviewLog)
      .where(eq(reviewLog.userId, userId)),
    db
      .select({ day: dayOf(card.due), due: sql<number>`count(*)` })
      .from(card)
      .where(
        and(
          eq(card.userId, userId),
          ne(card.state, State.New),
          eq(card.suspended, false),
          isNull(card.learnedAt),
          lt(card.due, forecastEnd),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ state: card.state, n: sql<number>`count(*)` })
      .from(card)
      // Cards in daily study only: learned and suspended words are left out.
      .where(and(eq(card.userId, userId), eq(card.suspended, false), isNull(card.learnedAt)))
      .groupBy(card.state),
    db
      .select({ n: sql<number>`count(*)` })
      .from(card)
      .where(and(eq(card.userId, userId), eq(card.reverse, false), isNotNull(card.learnedAt))),
  ]);

  const dailyByDay = new Map(daily.map((d) => [d.day, d]));
  const reviewsByDay = new Map(reviewDays.map((d) => [d.day, d.reviews]));
  const todayRow = dailyByDay.get(today);

  const streak = streaks(
    reviewDays.map((d) => d.day),
    today,
  ).current;

  const forecastByDay = new Map<number, number>();
  for (const f of forecast) {
    const day = Math.max(f.day, today);
    forecastByDay.set(day, (forecastByDay.get(day) ?? 0) + f.due);
  }

  const stateCount = (s: State) => states.find((r) => r.state === s)?.n ?? 0;
  const t = totals[0];

  return c.json({
    today: { reviews: todayRow?.reviews ?? 0, durationMs: todayRow?.durationMs ?? 0 },
    streak,
    retention: t && t.matureAnswers > 0 ? 1 - t.matureAgain / t.matureAnswers : null,
    totalReviews: t?.total ?? 0,
    daily: Array.from({ length: HISTORY_DAYS }, (_, i) => {
      const day = today - HISTORY_DAYS + 1 + i;
      const row = dailyByDay.get(day);
      return { day: now.label(day), reviews: row?.reviews ?? 0, again: row?.again ?? 0 };
    }),
    calendar: Array.from({ length: CALENDAR_DAYS }, (_, i) => {
      const day = today - CALENDAR_DAYS + 1 + i;
      return { day: now.label(day), reviews: reviewsByDay.get(day) ?? 0 };
    }),
    forecast: Array.from({ length: FORECAST_DAYS }, (_, i) => ({
      day: now.label(today + i),
      due: forecastByDay.get(today + i) ?? 0,
    })),
    states: {
      new: stateCount(State.New),
      learning: stateCount(State.Learning),
      review: stateCount(State.Review),
      relearning: stateCount(State.Relearning),
    },
    learned: learned[0]?.n ?? 0,
  } satisfies Stats);
});
