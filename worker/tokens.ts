import { and, eq } from "drizzle-orm";
import type { Db } from "./context";
import { apiToken } from "./db/schema";

export const TOKEN_PREFIX = "fw_";
/** Don't write last-used more often than this. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateToken() {
  return TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves a bearer token to its user, recording when it was last used. */
export async function userForToken(db: Db, token: string, waitUntil: (p: Promise<unknown>) => void) {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = await db.query.apiToken.findFirst({ where: eq(apiToken.tokenHash, await hashToken(token)) });
  if (!row) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt > TOUCH_INTERVAL_MS) {
    waitUntil(db.update(apiToken).set({ lastUsedAt: now }).where(and(eq(apiToken.id, row.id))).run());
  }
  return row.userId;
}
