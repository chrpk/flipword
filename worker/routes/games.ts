import { zValidator } from "@hono/zod-validator";
import { and, count, eq, gte, inArray, max, min, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { GAME_INFO, GAMES, scoreIsTime, type CardPool, type GameId, type GameMode } from "../../shared/games";
import { playQuery, practiceInput, type gameAnswerInput } from "../../shared/schemas";
import { createScheduler, gradeCard, isLeechLapse, Rating, State, type Grade } from "../../shared/srs";
import type { GameBest, PlayCard, PracticeResult } from "../../shared/types";
import { clock, type AppEnv, type Clock, type Db } from "../context";
import { card, deck, gameSession, practiceLog, reviewLog } from "../db/schema";
import { getSettings, toCardDto } from "../queries";

async function ownDeck(db: Db, userId: string, id: string) {
  const row = await db.query.deck.findFirst({ where: and(eq(deck.id, id), eq(deck.userId, userId)) });
  if (!row) throw new HTTPException(404, { message: "Deck not found" });
  return row;
}

/** The word's latest game answer was wrong. */
const missedLast = sql`coalesce((select p.correct from ${practiceLog} as p where p.card_id = ${card.id}
  order by p.created_at desc limit 1), 1) = 0`;

/**
 * How eagerly a pool wants a card (higher first; ties are shuffled). Due means what today's study would show;
 * known means graduated to review or marked learned.
 */
export function poolPriority(pool: CardPool, clk: Clock): SQL<number> {
  const isNew = sql`(${card.state} = ${State.New} and ${card.learnedAt} is null)`;
  const due = sql`(${card.state} != ${State.New} and ${card.due} < ${clk.dayEnd()})`;
  const known = sql`(${card.learnedAt} is not null or ${card.state} = ${State.Review})`;
  const learning = sql`${card.state} in (${State.Learning}, ${State.Relearning})`;
  switch (pool) {
    case "intro":
      return sql<number>`case when ${missedLast} then 3 when ${due} then 2 else 1 end`;
    case "practice":
      return sql<number>`case when ${missedLast} then 3 when ${due} then 2 when ${isNew} then 0 else 1 end`;
    case "known":
      return sql<number>`case when ${known} then 2 when ${isNew} then 0 else 1 end`;
    case "weak":
      return sql<number>`case when ${missedLast} then 4 when ${learning} then 3 when ${due} then 2 when ${isNew} then 0 else 1 end`;
  }
}

/** Points use the highest score, standard Match the lowest time. */
const bestOf = (game: GameId, mode: GameMode, r: { high: number | null; low: number | null } | undefined) =>
  r ? (scoreIsTime(game, mode) ? r.low : r.high) : null;

type Answer = z.output<typeof gameAnswerInput>;

/** Study rating for a typed game answer: never Easy, Hard when it needed help or was only "almost". */
export function gameRating(a: Pick<Answer, "correct" | "hints" | "nearMiss">): Grade {
  if (!a.correct) return Rating.Again;
  return a.hints > 0 || a.nearMiss ? Rating.Hard : Rating.Good;
}

/**
 * Typed answers that count as reviews (when the user turned that on): the first try at each word, on a word that's
 * due now, that nothing reviewed today. Producing the word from its meaning is what a reverse card asks, so the
 * review goes to the word's reverse card when the deck has one, else to its only card.
 */
async function gameReviews(db: Db, userId: string, game: GameId, answers: Answer[], clk: Clock, retention: number) {
  const firstTyped = new Map<string, Answer>();
  for (const a of answers) if (a.format === "typed" && a.attempt === 1 && !firstTyped.has(a.cardId)) firstTyped.set(a.cardId, a);
  if (firstTyped.size === 0) return { statements: [], reviewed: 0 };

  // Games deal forward cards, whose id is the word's note id.
  const noteIds = [...firstTyped.keys()];
  const [rows, today] = await Promise.all([
    db
      .select()
      .from(card)
      .where(and(eq(card.userId, userId), inArray(card.noteId, noteIds))),
    // Words with a review today, in either direction.
    db
      .selectDistinct({ noteId: card.noteId })
      .from(reviewLog)
      .innerJoin(card, eq(card.id, reviewLog.cardId))
      .where(and(eq(reviewLog.userId, userId), inArray(card.noteId, noteIds), gte(reviewLog.review, clk.dayStart()))),
  ]);
  const reviewedToday = new Set(today.map((r) => r.noteId));

  const byNote = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!byNote.has(r.noteId) || r.reverse) byNote.set(r.noteId, r);
  }

  const scheduler = createScheduler(retention);
  const statements = [];
  let reviewed = 0;
  for (const [noteId, answer] of firstTyped) {
    const row = byNote.get(noteId);
    if (!row || reviewedToday.has(noteId)) continue;
    const dueNow =
      row.state === State.Review ? row.due < clk.dayEnd() : row.state !== State.New && row.due <= clk.now;
    if (row.suspended || row.learnedAt !== null || !dueNow) continue;

    const at = Math.max(clk.now, (row.lastReview ?? 0) + 1);
    const result = gradeCard(scheduler, row, gameRating(answer), at);
    const leech = result.card.lapses > row.lapses && isLeechLapse(result.card.lapses);
    reviewed++;
    statements.push(
      db
        .update(card)
        .set({ ...result.card, suspended: leech || row.suspended, updatedAt: Date.now() })
        .where(eq(card.id, row.id)),
      db.insert(reviewLog).values({
        id: crypto.randomUUID(),
        cardId: row.id,
        userId,
        ...result.log,
        durationMs: answer.latencyMs ?? 0,
        source: `game:${game}`,
      }),
      ...(leech ? [db.update(card).set({ suspended: true }).where(eq(card.noteId, row.noteId))] : []),
    );
  }
  return { statements, reviewed };
}

export const games = new Hono<AppEnv>()
  .get("/decks/:id/games", async (c) => {
    const db = c.get("db");
    const row = await ownDeck(db, c.get("userId"), c.req.param("id"));
    const [rows, [words]] = await Promise.all([
      db
        .select({
          game: gameSession.game,
          mode: gameSession.mode,
          plays: count(),
          high: max(gameSession.score),
          low: min(gameSession.score),
        })
        .from(gameSession)
        .where(eq(gameSession.deckId, row.id))
        .groupBy(gameSession.game, gameSession.mode),
      db
        .select({
          total: sql<number>`count(*)`,
          withExample: sql<number>`coalesce(sum(${card.example} != ''), 0)`,
        })
        .from(card)
        .where(and(eq(card.deckId, row.id), eq(card.reverse, false), eq(card.suspended, false))),
    ]);
    return c.json(
      GAMES.map((game): GameBest => {
        const mine = rows.filter((x) => x.game === game);
        const of = (mode: GameMode) => mine.find((x) => x.mode === mode);
        return {
          game,
          plays: mine.reduce((n, x) => n + x.plays, 0),
          best: bestOf(game, "standard", of("standard")),
          relaxedBest: GAME_INFO[game].timed ? bestOf(game, "relaxed", of("relaxed")) : null,
          available: GAME_INFO[game].needs === "example" ? words.withExample : words.total,
        };
      }),
    );
  })
  .get("/decks/:id/play", zValidator("query", playQuery), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await ownDeck(db, userId, c.req.param("id"));
    const { count: limit, pool, needs } = c.req.valid("query");
    const priority = poolPriority(pool, clock(c));
    const order: SQL[] = [
      // Words with the data a game needs come first, so a big deck with few examples still fills the game.
      ...(needs === "example" ? [sql`(${card.example} != '') desc`] : []),
      sql`${priority} desc`,
      ...(pool === "weak" ? [sql`${card.lapses} desc`] : []),
      sql`random()`,
    ];
    // Games use one card per word (the forward card) and skip suspended words.
    const rows = await db
      .select()
      .from(card)
      .where(and(eq(card.deckId, row.id), eq(card.reverse, false), eq(card.suspended, false)))
      .orderBy(...order)
      .limit(limit);

    // Words picked instead of these before, in either direction: the hardest distractors to tell apart.
    const ids = rows.map((r) => r.id);
    const confusions = ids.length
      ? await db
          .select({ a: practiceLog.cardId, b: practiceLog.confusedWith, n: count() })
          .from(practiceLog)
          .where(
            and(
              eq(practiceLog.userId, userId),
              sql`${practiceLog.confusedWith} is not null`,
              sql`(${inArray(practiceLog.cardId, ids)} or ${inArray(practiceLog.confusedWith, ids)})`,
            ),
          )
          .groupBy(practiceLog.cardId, practiceLog.confusedWith)
          .orderBy(sql`count(*) desc`)
      : [];
    const confused = new Map<string, string[]>();
    const link = (from: string, to: string) => {
      const list = confused.get(from) ?? [];
      if (!list.includes(to)) list.push(to);
      confused.set(from, list);
    };
    for (const x of confusions) {
      if (!x.b) continue;
      link(x.a, x.b);
      link(x.b, x.a);
    }
    return c.json(rows.map((r): PlayCard => ({ ...toCardDto(r), confusedWith: confused.get(r.id) ?? [] })));
  })
  .post("/practice", zValidator("json", practiceInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const input = c.req.valid("json");
    const info = GAME_INFO[input.game];
    if (input.mode === "relaxed" && !info.timed) throw new HTTPException(400, { message: "This game has no relaxed mode" });
    if (input.answers.some((a) => a.format && !info.formats.includes(a.format))) {
      throw new HTTPException(400, { message: "Answer format doesn't match the game" });
    }
    // Answered words, and words picked instead of them: all must be the user's own.
    const ids = [...new Set(input.answers.flatMap((a) => (a.confusedWith ? [a.cardId, a.confusedWith] : [a.cardId])))];

    const [target, found, previous, settings] = await Promise.all([
      ownDeck(db, userId, input.deckId),
      // Only log answers for the user's own cards (one query, however many answers).
      ids.length
        ? db
            .select({ id: card.id })
            .from(card)
            .where(and(eq(card.userId, userId), sql`${card.id} in (select value from json_each(${JSON.stringify(ids)}))`))
        : [],
      input.mode === "retry"
        ? []
        : db
            .select({ high: max(gameSession.score), low: min(gameSession.score) })
            .from(gameSession)
            .where(
              and(
                eq(gameSession.deckId, input.deckId),
                eq(gameSession.userId, userId),
                eq(gameSession.game, input.game),
                eq(gameSession.mode, input.mode),
              ),
            ),
      getSettings(db, userId),
    ]);
    const owned = new Set(found.map((f) => f.id));
    const answers = input.answers.filter((a) => owned.has(a.cardId));

    const clk = clock(c);
    const now = clk.now;
    const logs = answers.map((a, i) => ({
      id: crypto.randomUUID(),
      c: a.cardId,
      ok: a.correct ? 1 : 0,
      f: a.format ?? "",
      h: a.hints,
      a: a.attempt,
      l: a.latencyMs ?? null,
      n: a.nearMiss ? 1 : 0,
      // Only a deck word the user owns can be "confused with".
      w: a.confusedWith && owned.has(a.confusedWith) && a.confusedWith !== a.cardId ? a.confusedWith : null,
      t: now + i,
    }));
    const correct = input.answers.filter((a) => a.correct).length;

    let result: PracticeResult;
    if (input.mode === "retry") {
      result = { best: null, isBest: false, reviewed: 0 };
    } else {
      const prev = bestOf(input.game, input.mode, previous[0]);
      const lower = scoreIsTime(input.game, input.mode);
      const isBest = prev == null || (lower ? input.score < prev : input.score > prev);
      result = { best: isBest ? input.score : prev, isBest, reviewed: 0 };
    }

    const reviews = settings.gameReviews
      ? await gameReviews(db, userId, input.game, answers, clk, settings.desiredRetention)
      : { statements: [], reviewed: 0 };

    const d1 = c.env.DB;
    await d1.batch([
      d1
        .prepare(
          `insert into game_session (id, user_id, deck_id, game, mode, score, correct, wrong, duration_ms, created_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          target.id,
          input.game,
          input.mode,
          input.score,
          correct,
          input.answers.length - correct,
          input.durationMs,
          now,
        ),
      // All answers in one statement via json_each.
      ...(logs.length
        ? [
            d1
              .prepare(
                `insert into practice_log (id, card_id, user_id, game, correct, format, hints, attempt, latency_ms, near_miss, confused_with, created_at)
                 select json_extract(value, '$.id'), json_extract(value, '$.c'), ?1, ?2, json_extract(value, '$.ok'),
                   json_extract(value, '$.f'), json_extract(value, '$.h'), json_extract(value, '$.a'), json_extract(value, '$.l'),
                   json_extract(value, '$.n'), json_extract(value, '$.w'), json_extract(value, '$.t')
                 from json_each(?3)`,
              )
              .bind(userId, input.game, JSON.stringify(logs)),
          ]
        : []),
    ]);
    const [first, ...rest] = reviews.statements;
    if (first) {
      await db.batch([first, ...rest]);
      result.reviewed = reviews.reviewed;
    }
    return c.json(result);
  });
