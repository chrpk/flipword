import { zValidator } from "@hono/zod-validator";
import { and, count, eq, max, min, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { GAME_INFO, GAMES } from "../../shared/games";
import { playQuery, practiceInput } from "../../shared/schemas";
import type { GameBest, PracticeResult } from "../../shared/types";
import type { AppEnv, Db } from "../context";
import { card, deck, gameSession } from "../db/schema";
import { toCardDto } from "../queries";

async function ownDeck(db: Db, userId: string, id: string) {
  const row = await db.query.deck.findFirst({ where: and(eq(deck.id, id), eq(deck.userId, userId)) });
  if (!row) throw new HTTPException(404, { message: "Deck not found" });
  return row;
}

export const games = new Hono<AppEnv>()
  .get("/decks/:id/games", async (c) => {
    const db = c.get("db");
    const row = await ownDeck(db, c.get("userId"), c.req.param("id"));
    const rows = await db
      .select({ game: gameSession.game, plays: count(), high: max(gameSession.score), low: min(gameSession.score) })
      .from(gameSession)
      .where(eq(gameSession.deckId, row.id))
      .groupBy(gameSession.game);
    return c.json(
      GAMES.map((game): GameBest => {
        const r = rows.find((x) => x.game === game);
        return { game, plays: r?.plays ?? 0, best: r ? (GAME_INFO[game].lowerIsBetter ? r.low : r.high) : null };
      }),
    );
  })
  .get("/decks/:id/play", zValidator("query", playQuery), async (c) => {
    const db = c.get("db");
    const row = await ownDeck(db, c.get("userId"), c.req.param("id"));
    // Games use one card per word (the forward card) and skip suspended words.
    const rows = await db
      .select()
      .from(card)
      .where(and(eq(card.deckId, row.id), eq(card.reverse, false), eq(card.suspended, false)))
      .orderBy(sql`random()`)
      .limit(c.req.valid("query").count);
    return c.json(rows.map(toCardDto));
  })
  .post("/practice", zValidator("json", practiceInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const input = c.req.valid("json");
    const ids = [...new Set(input.answers.map((a) => a.cardId))];

    const [target, found, previous] = await Promise.all([
      ownDeck(db, userId, input.deckId),
      // Only log answers for the user's own cards (one query, however many answers).
      ids.length
        ? db
            .select({ id: card.id })
            .from(card)
            .where(and(eq(card.userId, userId), sql`${card.id} in (select value from json_each(${JSON.stringify(ids)}))`))
        : [],
      db
        .select({ high: max(gameSession.score), low: min(gameSession.score) })
        .from(gameSession)
        .where(and(eq(gameSession.deckId, input.deckId), eq(gameSession.userId, userId), eq(gameSession.game, input.game))),
    ]);
    const owned = new Set(found.map((f) => f.id));

    const now = Date.now();
    const logs = input.answers
      .filter((a) => owned.has(a.cardId))
      .map((a, i) => ({ id: crypto.randomUUID(), c: a.cardId, ok: a.correct ? 1 : 0, t: now + i }));
    const correct = input.answers.filter((a) => a.correct).length;

    const lowerIsBetter = GAME_INFO[input.game].lowerIsBetter;
    const prev = lowerIsBetter ? previous[0]?.low : previous[0]?.high;
    const isBest = prev == null || (lowerIsBetter ? input.score < prev : input.score > prev);

    const d1 = c.env.DB;
    await d1.batch([
      d1
        .prepare(
          `insert into game_session (id, user_id, deck_id, game, score, correct, wrong, duration_ms, created_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(crypto.randomUUID(), userId, target.id, input.game, input.score, correct, input.answers.length - correct, input.durationMs, now),
      // All answers in one statement via json_each.
      ...(logs.length
        ? [
            d1
              .prepare(
                `insert into practice_log (id, card_id, user_id, game, correct, created_at)
                 select json_extract(value, '$.id'), json_extract(value, '$.c'), ?1, ?2, json_extract(value, '$.ok'), json_extract(value, '$.t')
                 from json_each(?3)`,
              )
              .bind(userId, input.game, JSON.stringify(logs)),
          ]
        : []),
    ]);
    return c.json({ best: isBest ? input.score : prev!, isBest } satisfies PracticeResult);
  });
