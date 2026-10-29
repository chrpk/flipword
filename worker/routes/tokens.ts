import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { tokenInput } from "../../shared/schemas";
import type { ApiTokenInfo, CreatedToken } from "../../shared/types";
import { requireSession, type AppEnv } from "../context";
import { apiToken } from "../db/schema";
import { generateToken, hashToken } from "../tokens";

const MAX_TOKENS = 20;

const toInfo = (row: typeof apiToken.$inferSelect): ApiTokenInfo => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

export const tokens = new Hono<AppEnv>()
  .use("*", requireSession)
  .get("/", async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(apiToken)
      .where(eq(apiToken.userId, c.get("userId")))
      .orderBy(desc(apiToken.createdAt));
    return c.json(rows.map(toInfo));
  })
  .post("/", zValidator("json", tokenInput), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const existing = await db.$count(apiToken, eq(apiToken.userId, userId));
    if (existing >= MAX_TOKENS) throw new HTTPException(409, { message: "Too many tokens; revoke one first" });
    const token = generateToken();
    const row = {
      id: crypto.randomUUID(),
      userId,
      name: c.req.valid("json").name,
      tokenHash: await hashToken(token),
      prefix: token.slice(0, 7),
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    await db.insert(apiToken).values(row);
    // The token itself is only ever returned here.
    return c.json({ ...toInfo(row), token } satisfies CreatedToken, 201);
  })
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const deleted = await db
      .delete(apiToken)
      .where(and(eq(apiToken.id, c.req.param("id")), eq(apiToken.userId, c.get("userId"))))
      .returning({ id: apiToken.id });
    if (deleted.length === 0) throw new HTTPException(404, { message: "Token not found" });
    return c.body(null, 204);
  });
