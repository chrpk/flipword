import { eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { timeZoneOffset } from "../shared/time";
import { getAuth } from "./auth";
import { userForToken } from "./tokens";
import { schema, userSettings } from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Db = DrizzleD1Database<typeof schema>;

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    userId: string;
    /** Client's Date#getTimezoneOffset(), in minutes; null until resolved when the request didn't send one. */
    tzOffset: number | null;
    /** How the request was authenticated: a browser session or a personal access token. */
    authKind: "session" | "token";
  };
};

/** Day boundaries in the client's timezone. */
export class Clock {
  readonly now: number;
  readonly tzOffset: number;

  constructor(now: number, tzOffset: number) {
    this.now = now;
    this.tzOffset = tzOffset;
  }

  private get offsetMs() {
    return this.tzOffset * 60_000;
  }

  dayIndex(ms: number) {
    return Math.floor((ms - this.offsetMs) / DAY_MS);
  }

  dayStart(dayIndex = this.dayIndex(this.now)) {
    return dayIndex * DAY_MS + this.offsetMs;
  }

  dayEnd() {
    return this.dayStart() + DAY_MS;
  }

  /** YYYY-MM-DD label for a day index. */
  label(dayIndex: number) {
    return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
  }
}

export { DAY_MS };

export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  const header = c.req.header("x-tz-offset");
  const offset = header === undefined || header === "" ? NaN : Number(header);
  c.set("tzOffset", Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? Math.trunc(offset) : null);
  await next();
});

/** Who sent the request: a personal access token (Bearer) or a browser session. Null when neither is valid. */
export async function resolveUser(c: Context<AppEnv>): Promise<{ userId: string; authKind: "session" | "token" } | null> {
  const bearer = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) {
    const userId = await userForToken(c.get("db"), bearer, (p) => c.executionCtx.waitUntil(p));
    return userId ? { userId, authKind: "token" } : null;
  }
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session ? { userId: session.user.id, authKind: "session" } : null;
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const who = await resolveUser(c);
  if (!who) {
    const bearer = /^Bearer\s/i.test(c.req.header("authorization") ?? "");
    throw new HTTPException(401, { message: bearer ? "Invalid or revoked token" : "Unauthorized" });
  }
  c.set("userId", who.userId);
  c.set("authKind", who.authKind);
  // MCP clients and scripts don't send the browser's offset: use the time zone the app last saw for this user.
  if (c.get("tzOffset") === null) {
    const saved = await c
      .get("db")
      .select({ timeZone: userSettings.timeZone })
      .from(userSettings)
      .where(eq(userSettings.userId, c.get("userId")));
    const tz = saved[0]?.timeZone;
    c.set("tzOffset", (tz ? timeZoneOffset(tz, Date.now()) : null) ?? 0);
  }
  await next();
});

/** Per-user request limit (see `ratelimits` in wrangler.jsonc). Runs after requireUser. */
export const limitRate = createMiddleware<AppEnv>(async (c, next) => {
  const { success } = await c.env.API_RATE_LIMITER.limit({ key: c.get("userId") });
  if (!success) {
    return c.json({ error: "Too many requests. Please slow down and try again in a minute." }, 429, { "retry-after": "60" });
  }
  await next();
});

/** Token management stays in the browser: a leaked token can't mint or revoke tokens. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("authKind") !== "session") throw new HTTPException(403, { message: "Sign in with a browser to manage tokens" });
  await next();
});

export function clock(c: { get(key: "tzOffset"): number | null }) {
  return new Clock(Date.now(), c.get("tzOffset") ?? 0);
}
