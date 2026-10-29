import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cardPatch } from "../../shared/schemas";
import type { GameId } from "../../shared/games";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, PHOTO_STORAGE_BYTES } from "../../shared/images";
import { newSrsFields, Rating } from "../../shared/srs";
import type { CardProgress } from "../../shared/types";
import type { AppEnv, Db } from "../context";
import { card, deck, practiceLog, reviewLog } from "../db/schema";
import { syncReverseCards, toCardDto } from "../queries";
import { deleteImages } from "./images";

async function findCard(db: Db, userId: string, id: string) {
  const row = await db.query.card.findFirst({ where: and(eq(card.id, id), eq(card.userId, userId)) });
  if (!row) throw new HTTPException(404, { message: "Card not found" });
  return row;
}

/** Text, deck and suspension belong to the word, so they apply to its forward and reverse cards alike. */
const sameNote = (row: { noteId: string; userId: string }) => and(eq(card.noteId, row.noteId), eq(card.userId, row.userId));

export const cards = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const row = await findCard(c.get("db"), c.get("userId"), c.req.param("id"));
    return c.json(toCardDto(row));
  })
  .patch("/:id", zValidator("json", cardPatch), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await findCard(db, userId, c.req.param("id"));
    const patch = c.req.valid("json");
    const now = Date.now();

    let target: typeof deck.$inferSelect | undefined;
    if (patch.deckId && patch.deckId !== row.deckId) {
      target = await db.query.deck.findFirst({ where: and(eq(deck.id, patch.deckId), eq(deck.userId, userId)) });
      if (!target) throw new HTTPException(404, { message: "Deck not found" });
    }

    const { learned, ...fields } = patch;
    const learnedAt = learned === undefined ? {} : { learnedAt: learned ? (row.learnedAt ?? now) : null };
    await db.update(card).set({ ...fields, ...learnedAt, updatedAt: now }).where(sameNote(row));
    // The destination deck decides whether the word is also studied in reverse.
    if (target) await syncReverseCards(db, target.id, target.reverseCards, now);

    // Moving a reverse card into a forward-only deck removes it; fall back to the word's forward card.
    const updated =
      (await db.query.card.findFirst({ where: eq(card.id, row.id) })) ??
      (await db.query.card.findFirst({ where: and(sameNote(row), eq(card.reverse, false)) }));
    return c.json(toCardDto(updated!));
  })
  .get("/:id/progress", async (c) => {
    const db = c.get("db");
    const row = await findCard(db, c.get("userId"), c.req.param("id"));
    const RECENT = 20;
    const [reviews, games] = await Promise.all([
      db
        .select({ at: reviewLog.review, correct: sql<number>`${reviewLog.rating} > ${Rating.Again}` })
        .from(reviewLog)
        .innerJoin(card, eq(card.id, reviewLog.cardId))
        .where(eq(card.noteId, row.noteId))
        .orderBy(desc(reviewLog.review)),
      db
        .select({ at: practiceLog.createdAt, correct: practiceLog.correct, game: practiceLog.game })
        .from(practiceLog)
        .innerJoin(card, eq(card.id, practiceLog.cardId))
        .where(eq(card.noteId, row.noteId))
        .orderBy(desc(practiceLog.createdAt)),
    ]);
    const tally = (items: { correct: unknown }[]) => ({
      correct: items.filter((i) => !!i.correct).length,
      wrong: items.filter((i) => !i.correct).length,
    });
    const recent = [
      ...reviews.map((r) => ({ at: r.at, correct: !!r.correct, source: "review" as const })),
      ...games.map((g) => ({ at: g.at, correct: g.correct, source: g.game as GameId })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT);
    return c.json({ reviews: tally(reviews), games: tally(games), recent } satisfies CardProgress);
  })
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const row = await findCard(db, c.get("userId"), c.req.param("id"));
    await db.delete(card).where(sameNote(row));
    await deleteImages(c.env.IMAGES, [row.imageKey]);
    return c.body(null, 204);
  })
  .put("/:id/image", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await findCard(db, userId, c.req.param("id"));
    const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new HTTPException(415, { message: "Use a JPEG, PNG, WebP or GIF image" });
    if (Number(c.req.header("content-length") ?? 0) > MAX_IMAGE_BYTES) {
      throw new HTTPException(413, { message: "Image is too large" });
    }
    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) throw new HTTPException(400, { message: "Empty image" });
    if (body.byteLength > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: "Image is too large" });

    // The photo being replaced doesn't count; each word's photo counts once (on its forward card).
    const [{ used }] = await db
      .select({ used: sql<number>`coalesce(sum(${card.imageBytes}), 0)` })
      .from(card)
      .where(and(eq(card.userId, userId), eq(card.reverse, false), ne(card.noteId, row.noteId)));
    if (used + body.byteLength > PHOTO_STORAGE_BYTES) {
      throw new HTTPException(507, { message: "Photo storage is full. Remove some photos to add new ones." });
    }

    const key = `${userId}/${row.noteId}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
    await db.update(card).set({ imageKey: key, imageBytes: body.byteLength, updatedAt: Date.now() }).where(sameNote(row));
    await deleteImages(c.env.IMAGES, [row.imageKey]);
    return c.json(toCardDto({ ...row, imageKey: key }));
  })
  .delete("/:id/image", async (c) => {
    const db = c.get("db");
    const row = await findCard(db, c.get("userId"), c.req.param("id"));
    await db.update(card).set({ imageKey: null, imageBytes: null, updatedAt: Date.now() }).where(sameNote(row));
    await deleteImages(c.env.IMAGES, [row.imageKey]);
    return c.json(toCardDto({ ...row, imageKey: null }));
  })
  .post("/:id/reset", async (c) => {
    const db = c.get("db");
    const row = await findCard(db, c.get("userId"), c.req.param("id"));
    const now = Date.now();
    const reset = { ...newSrsFields(now), learnedAt: null, updatedAt: now };
    await db.update(card).set(reset).where(sameNote(row));
    return c.json(toCardDto({ ...row, ...reset }));
  });
