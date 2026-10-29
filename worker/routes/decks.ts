import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bulkCardsInput, cardInput, cardListQuery, deckInput, deckPatch } from "../../shared/schemas";
import { LEARN_AHEAD_MS, State } from "../../shared/srs";
import type { CardList, DeckSummary, ImportResult } from "../../shared/types";
import { clock, type AppEnv, type Db } from "../context";
import { card, deck } from "../db/schema";
import {
  answerCountColumns,
  contains,
  deckCounts,
  EMPTY_COUNTS,
  insertCardStatements,
  newCardRows,
  syncReverseCards,
  toCardDto,
} from "../queries";
import { deleteImages } from "./images";

async function findDeck(db: Db, userId: string, id: string) {
  const row = await db.query.deck.findFirst({ where: and(eq(deck.id, id), eq(deck.userId, userId)) });
  if (!row) throw new HTTPException(404, { message: "Deck not found" });
  return row;
}

function toDeck(row: typeof deck.$inferSelect) {
  const { userId: _, ...rest } = row;
  return rest;
}

/** Cells starting with these are run as formulas by spreadsheet apps (CSV/formula injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string) {
  // Neutralise formulas with a leading apostrophe; flipword's importer strips it again, so round trips are lossless.
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const decks = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const [rows, counts] = await Promise.all([
      db.query.deck.findMany({ where: eq(deck.userId, userId), orderBy: [desc(deck.updatedAt)] }),
      deckCounts(db, userId, clock(c)),
    ]);
    return c.json(rows.map((d): DeckSummary => ({ ...toDeck(d), ...(counts.get(d.id) ?? EMPTY_COUNTS) })));
  })
  .post("/", zValidator("json", deckInput), async (c) => {
    const input = c.req.valid("json");
    const now = Date.now();
    const row = { id: crypto.randomUUID(), userId: c.get("userId"), ...input, createdAt: now, updatedAt: now };
    await c.get("db").insert(deck).values(row);
    return c.json({ ...toDeck(row), ...EMPTY_COUNTS } satisfies DeckSummary, 201);
  })
  .get("/:id", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await findDeck(db, userId, c.req.param("id"));
    const counts = await deckCounts(db, userId, clock(c), row.id);
    return c.json({ ...toDeck(row), ...(counts.get(row.id) ?? EMPTY_COUNTS) } satisfies DeckSummary);
  })
  .patch("/:id", zValidator("json", deckPatch), async (c) => {
    const db = c.get("db");
    const row = await findDeck(db, c.get("userId"), c.req.param("id"));
    const now = Date.now();
    const updated = { ...row, ...c.req.valid("json"), updatedAt: now };
    await db.update(deck).set(updated).where(eq(deck.id, row.id));
    if (updated.reverseCards !== row.reverseCards) await syncReverseCards(db, row.id, updated.reverseCards, now);
    return c.json(toDeck(updated));
  })
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const row = await findDeck(db, c.get("userId"), c.req.param("id"));
    const photos = await db.selectDistinct({ key: card.imageKey }).from(card).where(eq(card.deckId, row.id));
    await db.delete(deck).where(eq(deck.id, row.id));
    await deleteImages(c.env.IMAGES, photos.map((p) => p.key));
    return c.body(null, 204);
  })
  .get("/:id/cards", zValidator("query", cardListQuery), async (c) => {
    const db = c.get("db");
    const now = clock(c);
    const row = await findDeck(db, c.get("userId"), c.req.param("id"));
    const { q, filter, flag, offset, limit } = c.req.valid("query");

    // One row per word: list forward cards; their reverse siblings share text, suspension and deck.
    const conditions: (SQL | undefined)[] = [eq(card.deckId, row.id), eq(card.reverse, false)];
    if (q) conditions.push(or(...[card.front, card.back, card.example].map((col) => contains(col, q))));
    if (flag) conditions.push(eq(card.flag, flag));
    if (filter === "suspended") conditions.push(eq(card.suspended, true));
    else if (filter === "learned") conditions.push(isNotNull(card.learnedAt));
    // Schedule-based filters show only words still in daily study.
    else if (filter !== "all") conditions.push(eq(card.suspended, false), isNull(card.learnedAt));
    if (filter === "new") conditions.push(eq(card.state, State.New));
    if (filter === "learning") conditions.push(sql`${card.state} in (${State.Learning}, ${State.Relearning})`);
    if (filter === "review") conditions.push(eq(card.state, State.Review));
    if (filter === "due") {
      conditions.push(
        sql`((${card.state} in (${State.Learning}, ${State.Relearning}) and ${card.due} <= ${now.now + LEARN_AHEAD_MS})
          or (${card.state} = ${State.Review} and ${card.due} < ${now.dayEnd()}))`,
      );
    }
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ row: card, ...answerCountColumns() })
        .from(card)
        .where(where)
        .orderBy(desc(card.createdAt), asc(card.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(card).where(where),
    ]);
    const cards = rows.map(({ row: r, correctCount, wrongCount }) => ({ ...toCardDto(r), correctCount, wrongCount }));
    return c.json({ cards, total } satisfies CardList);
  })
  .post("/:id/cards", zValidator("json", cardInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await findDeck(db, userId, c.req.param("id"));
    const now = Date.now();
    const rows = newCardRows(row, userId, c.req.valid("json"), now);
    await db.batch([db.insert(card).values(rows), db.update(deck).set({ updatedAt: now }).where(eq(deck.id, row.id))]);
    const created = await db.query.card.findFirst({ where: eq(card.id, rows[0].id!) });
    return c.json(toCardDto(created!), 201);
  })
  .post("/:id/cards/bulk", zValidator("json", bulkCardsInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const row = await findDeck(db, userId, c.req.param("id"));
    const { cards: input, skipDuplicates } = c.req.valid("json");

    const seen = new Set<string>();
    if (skipDuplicates) {
      const existing = await db
        .select({ front: card.front })
        .from(card)
        .where(and(eq(card.deckId, row.id), eq(card.reverse, false)));
      for (const e of existing) seen.add(e.front.trim().toLowerCase());
    }

    const now = Date.now();
    const values = [];
    let created = 0;
    for (const [i, item] of input.entries()) {
      const key = item.front.toLowerCase();
      if (skipDuplicates && seen.has(key)) continue;
      seen.add(key);
      created++;
      // Spread createdAt by index so imported order is kept when listing newest first / studying oldest first.
      values.push(...newCardRows(row, userId, item, now, i));
    }

    if (values.length > 0) {
      // One atomic batch: the deck's timestamp plus a handful of json_each inserts, however many rows.
      const d1 = c.env.DB;
      await d1.batch([
        d1.prepare("update deck set updated_at = ?1 where id = ?2").bind(now, row.id),
        ...insertCardStatements(d1, values),
      ]);
    }
    return c.json({ created, skipped: input.length - created } satisfies ImportResult);
  })
  .get("/:id/export", async (c) => {
    const db = c.get("db");
    const row = await findDeck(db, c.get("userId"), c.req.param("id"));
    const rows = await db
      .select({ front: card.front, back: card.back, example: card.example })
      .from(card)
      .where(and(eq(card.deckId, row.id), eq(card.reverse, false)))
      .orderBy(asc(card.createdAt));
    const lines = ["front,back,example", ...rows.map((r) => [r.front, r.back, r.example].map(csvCell).join(","))];
    const filename = `${row.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "deck"}.csv`;
    return c.body(`\uFEFF${lines.join("\r\n")}\r\n`, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  });
