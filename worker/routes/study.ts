import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, ne, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { reviewInput, undoInput } from "../../shared/schemas";
import { createScheduler, gradeCard, isLeechLapse, rollbackCard } from "../../shared/srs";
import type { CardDto, ReviewResult, StudyQueue } from "../../shared/types";
import { clock, type AppEnv } from "../context";
import { card, reviewLog } from "../db/schema";
import { DAY_MS } from "../context";
import { getSettings, remainingToday, studyRules, toCardDto } from "../queries";

/** A client clock further off than this (measured at send time) is corrected to server time. */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/**
 * When the answer was revealed, in server time. The preview on the answer buttons used `reviewedAt`, so keep it when
 * the client clock is sane — even if the answer stayed revealed for a long time. The clock is judged by `sentAt`
 * (when the request left the client), not by the reveal time.
 */
export function reviewTime(input: { reviewedAt: number; sentAt?: number }, serverNow: number) {
  let at = input.reviewedAt;
  if (input.sentAt !== undefined) {
    const skew = serverNow - input.sentAt;
    if (Math.abs(skew) > MAX_CLOCK_SKEW_MS) at += skew;
  } else if (Math.abs(at - serverNow) > MAX_CLOCK_SKEW_MS) {
    // Older clients without sentAt: fall back to server time when the timestamp looks off.
    at = serverNow;
  }
  // Never in the (corrected) future, never absurdly old.
  return Math.min(Math.max(at, serverNow - DAY_MS), serverNow + MAX_CLOCK_SKEW_MS);
}

export const study = new Hono<AppEnv>()
  .get("/study", zValidator("query", z.object({ deckId: z.string().optional() })), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const now = clock(c);
    const { deckId } = c.req.valid("query");
    const { settings, newLeft, reviewsLeft } = await remainingToday(db, userId, now);

    const rules = studyRules(now);
    const scope = (rule: SQL): SQL | undefined =>
      and(eq(card.userId, userId), deckId ? eq(card.deckId, deckId) : undefined, rule);

    // The rules already pick one card per word, so these LIMITs count words.
    const [learning, reviews, fresh] = await Promise.all([
      db.select().from(card).where(scope(rules.learning)).orderBy(asc(card.due)),
      reviewsLeft > 0
        ? db.select().from(card).where(scope(rules.review)).orderBy(asc(card.due)).limit(reviewsLeft)
        : [],
      newLeft > 0
        ? db.select().from(card).where(scope(rules.fresh)).orderBy(asc(card.createdAt), asc(card.reverse)).limit(newLeft)
        : [],
    ]);

    // Safety net: never queue a word twice, or a word whose other direction is mid-learning.
    const notes = new Set(learning.map((r) => r.noteId));
    const queue: CardDto[] = [];
    for (const row of [...reviews, ...fresh]) {
      if (notes.has(row.noteId)) continue;
      notes.add(row.noteId);
      queue.push(toCardDto(row));
    }

    return c.json({
      learning: learning.map(toCardDto),
      queue,
      desiredRetention: settings.desiredRetention,
    } satisfies StudyQueue);
  })
  .post("/reviews", zValidator("json", reviewInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const input = c.req.valid("json");
    const [row, settings] = await Promise.all([
      db.query.card.findFirst({ where: and(eq(card.id, input.cardId), eq(card.userId, userId)) }),
      getSettings(db, userId),
    ]);
    if (!row) throw new HTTPException(404, { message: "Card not found" });

    const serverNow = Date.now();
    // A card can't be reviewed before its previous review.
    const now = Math.max(reviewTime(input, serverNow), (row.lastReview ?? 0) + 1);

    const result = gradeCard(createScheduler(settings.desiredRetention), row, input.rating, now);
    const leech = result.card.lapses > row.lapses && isLeechLapse(result.card.lapses);
    const updated = { ...row, ...result.card, suspended: row.suspended || leech, updatedAt: serverNow };
    const logId = crypto.randomUUID();

    await db.batch([
      db.update(card).set(updated).where(eq(card.id, row.id)),
      db.insert(reviewLog).values({ id: logId, cardId: row.id, userId, ...result.log, durationMs: input.durationMs }),
      ...(leech ? [db.update(card).set({ suspended: true }).where(and(eq(card.noteId, row.noteId), ne(card.id, row.id)))] : []),
    ]);
    return c.json({ card: toCardDto(updated), logId, leech } satisfies ReviewResult);
  })
  .post("/reviews/undo", zValidator("json", undoInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const log = await db.query.reviewLog.findFirst({
      where: and(eq(reviewLog.id, c.req.valid("json").logId), eq(reviewLog.userId, userId)),
    });
    if (!log) throw new HTTPException(404, { message: "Review not found" });

    const newer = await db.query.reviewLog.findFirst({
      where: and(eq(reviewLog.cardId, log.cardId), gt(reviewLog.review, log.review)),
      orderBy: [desc(reviewLog.review)],
    });
    if (newer) throw new HTTPException(409, { message: "Only the latest review of a card can be undone" });

    const [row, settings] = await Promise.all([
      db.query.card.findFirst({ where: eq(card.id, log.cardId) }),
      getSettings(db, userId),
    ]);
    if (!row) throw new HTTPException(404, { message: "Card not found" });
    const previous = rollbackCard(createScheduler(settings.desiredRetention), row, log);
    // Undoing the answer that made the card a leech also lifts the suspension it caused.
    const unLeech = row.suspended && isLeechLapse(row.lapses) && previous.lapses < row.lapses;
    const restored = { ...row, ...previous, suspended: row.suspended && !unLeech, updatedAt: Date.now() };
    await db.batch([
      db.update(card).set(restored).where(eq(card.id, row.id)),
      db.delete(reviewLog).where(eq(reviewLog.id, log.id)),
      ...(unLeech ? [db.update(card).set({ suspended: false }).where(eq(card.noteId, row.noteId))] : []),
    ]);
    return c.json(toCardDto(restored));
  });
