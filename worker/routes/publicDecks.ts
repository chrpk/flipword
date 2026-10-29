import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { publicCardQuery, publicDeckQuery, reportInput } from "../../shared/schemas";
import type { DeckSummary, PublicCardList, PublicDeck, PublicDeckList } from "../../shared/types";
import { type AppEnv, type Db } from "../context";
import { card, contentReport, deck, user } from "../db/schema";
import { contains, EMPTY_COUNTS, insertCardStatements, newCardRows } from "../queries";

/** Words in the outer `deck` row; a reversed word counts once. */
const wordCount = sql<number>`(select count(*) from ${card} where ${card.deckId} = ${deck.id} and ${card.reverse} = 0)`;

/** Only the first name is shown to other users. */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

const publicDeckColumns = {
  id: deck.id,
  userId: deck.userId,
  name: deck.name,
  description: deck.description,
  reverseCards: deck.reverseCards,
  visibility: deck.visibility,
  updatedAt: deck.updatedAt,
  total: wordCount,
  authorName: user.name,
};

function toPublicDeck(
  { userId, authorName, ...row }: Omit<PublicDeck, "isOwn"> & { userId: string },
  viewerId: string,
): PublicDeck {
  return { ...row, authorName: firstName(authorName), isOwn: userId === viewerId };
}

/** A deck the viewer may see through these routes: any public deck, or one of their own. */
async function findVisibleDeck(db: Db, viewerId: string, id: string) {
  const [row] = await db
    .select(publicDeckColumns)
    .from(deck)
    .innerJoin(user, eq(user.id, deck.userId))
    .where(and(eq(deck.id, id), or(eq(deck.visibility, "public"), eq(deck.userId, viewerId))));
  // Private decks of other users answer exactly like missing ones.
  if (!row) throw new HTTPException(404, { message: "Deck not found" });
  return row;
}

export const publicDecks = new Hono<AppEnv>()
  .get("/", zValidator("query", publicDeckQuery), async (c) => {
    const db = c.get("db");
    const { q, offset, limit } = c.req.valid("query");
    // Empty decks aren't worth finding; they can still be opened from a shared link.
    const conditions: (SQL | undefined)[] = [eq(deck.visibility, "public"), sql`${wordCount} > 0`];
    if (q) conditions.push(or(contains(deck.name, q), contains(deck.description, q)));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select(publicDeckColumns)
        .from(deck)
        .innerJoin(user, eq(user.id, deck.userId))
        .where(where)
        // Name matches first, then the most recently updated.
        .orderBy(...(q ? [desc(contains(deck.name, q))] : []), desc(deck.updatedAt), asc(deck.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(deck).where(where),
    ]);
    const viewerId = c.get("userId");
    return c.json({ decks: rows.map((r) => toPublicDeck(r, viewerId)), total } satisfies PublicDeckList);
  })
  .get("/:id", async (c) => {
    const viewerId = c.get("userId");
    const row = await findVisibleDeck(c.get("db"), viewerId, c.req.param("id"));
    return c.json(toPublicDeck(row, viewerId));
  })
  .get("/:id/cards", zValidator("query", publicCardQuery), async (c) => {
    const db = c.get("db");
    const row = await findVisibleDeck(db, c.get("userId"), c.req.param("id"));
    const { q, offset, limit } = c.req.valid("query");

    const conditions: (SQL | undefined)[] = [eq(card.deckId, row.id), eq(card.reverse, false)];
    if (q) conditions.push(or(...[card.front, card.back, card.example].map((col) => contains(col, q))));
    const where = and(...conditions);

    const [cards, [{ total }]] = await Promise.all([
      db
        .select({ id: card.id, front: card.front, back: card.back, example: card.example })
        .from(card)
        .where(where)
        // The author's order, as a learner would meet the words.
        .orderBy(asc(card.createdAt), asc(card.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(card).where(where),
    ]);
    return c.json({ cards, total } satisfies PublicCardList);
  })
  .post("/:id/copy", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const source = await findVisibleDeck(db, userId, c.req.param("id"));
    const words = await db
      .select({ front: card.front, back: card.back, example: card.example })
      .from(card)
      .where(and(eq(card.deckId, source.id), eq(card.reverse, false)))
      .orderBy(asc(card.createdAt), asc(card.id));

    // The copy is the user's own private deck: text only, with fresh scheduling and no photos, flags or history.
    const now = Date.now();
    const copy = {
      id: crypto.randomUUID(),
      name: source.name,
      description: source.description,
      reverseCards: source.reverseCards,
      visibility: "private" as const,
      createdAt: now,
      updatedAt: now,
    };
    const rows = words.flatMap((w, i) => newCardRows(copy, userId, w, now, i));
    const d1 = c.env.DB;
    await d1.batch([
      d1
        .prepare(
          `insert into deck (id, user_id, name, description, reverse_cards, visibility, created_at, updated_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
        )
        .bind(copy.id, userId, copy.name, copy.description, copy.reverseCards ? 1 : 0, copy.visibility, now),
      ...insertCardStatements(d1, rows),
    ]);
    // Every copied card is new; today's limits are applied the next time the deck list loads.
    return c.json({ ...copy, ...EMPTY_COUNTS, total: words.length } satisfies DeckSummary, 201);
  })
  .post("/:id/report", zValidator("json", reportInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const target = await findVisibleDeck(db, userId, c.req.param("id"));
    if (target.userId === userId) throw new HTTPException(400, { message: "You can't report your own deck" });
    const { reason, details } = c.req.valid("json");
    const createdAt = Date.now();
    // Reporting the same deck again replaces the earlier report and reopens it.
    await db
      .insert(contentReport)
      .values({ id: crypto.randomUUID(), deckId: target.id, reporterId: userId, reason, details, createdAt })
      .onConflictDoUpdate({
        target: [contentReport.deckId, contentReport.reporterId],
        set: { reason, details, createdAt, resolvedAt: null },
      });
    return c.body(null, 204);
  });
