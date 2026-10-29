import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { settingsPatch } from "../../shared/schemas";
import type { Me } from "../../shared/types";
import type { AppEnv, Db } from "../context";
import {
  achievement,
  apiToken,
  card,
  contentReport,
  deck,
  gameSession,
  practiceLog,
  reviewLog,
  user,
  userSettings,
} from "../db/schema";
import { DEFAULT_SETTINGS, getSettings } from "../queries";

/** The user's profile and settings; null if the user no longer exists. */
export async function loadMe(db: Db, userId: string): Promise<Me | null> {
  const [row, settings] = await Promise.all([db.query.user.findFirst({ where: eq(user.id, userId) }), getSettings(db, userId)]);
  if (!row) return null;
  return { user: { id: row.id, name: row.name, email: row.email, image: row.image }, settings };
}

export const me = new Hono<AppEnv>()
  .get("/me", async (c) => {
    const data = await loadMe(c.get("db"), c.get("userId"));
    if (!data) throw new HTTPException(401, { message: "Unauthorized" });
    return c.json(data);
  })
  .patch("/settings", zValidator("json", settingsPatch), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const { flagNames, ...patch } = c.req.valid("json");
    const updatedAt = Date.now();
    const stored = { ...patch, ...(flagNames ? { flagNames: JSON.stringify(flagNames) } : {}) };
    await db
      .insert(userSettings)
      .values({ ...DEFAULT_SETTINGS, flagNames: JSON.stringify(DEFAULT_SETTINGS.flagNames), ...stored, userId, updatedAt })
      .onConflictDoUpdate({ target: userSettings.userId, set: { ...stored, updatedAt } });
    return c.json(await getSettings(db, userId));
  })
  /**
   * Everything stored about the user, as one JSON download (GDPR access and portability). Photos are listed by key;
   * each one is at /api/images/<key>.
   */
  .get("/me/export", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const mine = <T extends { userId: SQLiteColumn }>(table: T) => eq(table.userId, userId);
    const [profile, settings, decks, cards, reviews, practice, games, achievements, tokens, reports] = await Promise.all([
      db.query.user.findFirst({ where: eq(user.id, userId) }),
      getSettings(db, userId),
      db.select().from(deck).where(mine(deck)).orderBy(asc(deck.createdAt)),
      db.select().from(card).where(mine(card)).orderBy(asc(card.createdAt), asc(card.id)),
      db.select().from(reviewLog).where(mine(reviewLog)).orderBy(asc(reviewLog.review)),
      db.select().from(practiceLog).where(mine(practiceLog)).orderBy(asc(practiceLog.createdAt)),
      db.select().from(gameSession).where(mine(gameSession)).orderBy(asc(gameSession.createdAt)),
      db.select().from(achievement).where(mine(achievement)).orderBy(asc(achievement.unlockedAt)),
      // Token hashes stay out: they're credentials, not personal data worth carrying elsewhere.
      db
        .select({
          name: apiToken.name,
          prefix: apiToken.prefix,
          createdAt: apiToken.createdAt,
          lastUsedAt: apiToken.lastUsedAt,
        })
        .from(apiToken)
        .where(mine(apiToken)),
      db
        .select({
          deckId: contentReport.deckId,
          reason: contentReport.reason,
          details: contentReport.details,
          createdAt: contentReport.createdAt,
        })
        .from(contentReport)
        .where(eq(contentReport.reporterId, userId)),
    ]);
    if (!profile) throw new HTTPException(401, { message: "Unauthorized" });

    const withoutUser = <T extends { userId: string }>(row: T): Omit<T, "userId"> => {
      const { userId: _, ...rest } = row;
      return rest;
    };
    const cardsByDeck = new Map<string, Omit<(typeof cards)[number], "userId">[]>();
    for (const x of cards) {
      const list = cardsByDeck.get(x.deckId) ?? [];
      list.push(withoutUser(x));
      cardsByDeck.set(x.deckId, list);
    }
    const data = {
      exportedAt: new Date().toISOString(),
      user: { name: profile.name, email: profile.email, image: profile.image, createdAt: profile.createdAt.toISOString() },
      settings,
      decks: decks.map((d) => ({ ...withoutUser(d), cards: cardsByDeck.get(d.id) ?? [] })),
      reviewLog: reviews.map(withoutUser),
      practiceLog: practice.map(withoutUser),
      gameSessions: games.map(withoutUser),
      achievements: achievements.map(withoutUser),
      apiTokens: tokens,
      reports,
    };
    const filename = `flipword-export-${new Date().toISOString().slice(0, 10)}.json`;
    return c.body(JSON.stringify(data, null, 2), 200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    });
  });
