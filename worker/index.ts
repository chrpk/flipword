import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { appConfig, getAuth } from "./auth";
import { limitRate, requireUser, resolveUser, withDb, type AppEnv } from "./context";
import { achievements } from "./routes/achievements";
import { cards } from "./routes/cards";
import { decks } from "./routes/decks";
import { games } from "./routes/games";
import { handleMcp } from "./mcp";
import { servePage } from "./pages";
import { images } from "./routes/images";
import { loadMe, me } from "./routes/me";
import { publicDecks } from "./routes/publicDecks";
import { stats } from "./routes/stats";
import { study } from "./routes/study";
import { tokens } from "./routes/tokens";

const app = new Hono<AppEnv>().basePath("/api");

// The app's own pages get their headers from public/_headers; these cover API responses, which are JSON, images and
// redirects (plus Better Auth's error page, which has an inline <style>).
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      styleSrc: ["'unsafe-inline'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
  }),
);

app.on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

// For uptime monitors: checks the database and photo storage too, and answers 503 when either is unreachable.
app.get("/health", async (c) => {
  // Started inside the chain so a binding that throws synchronously also counts as down.
  const check = (probe: () => Promise<unknown>) =>
    Promise.resolve()
      .then(probe)
      .then(
        () => "ok" as const,
        (err: unknown) => {
          console.error("health check failed", err);
          return "error" as const;
        },
      );
  const [db, storage] = await Promise.all([
    check(() => c.env.DB.prepare("select 1").first()),
    check(() => c.env.IMAGES.head("health-check")),
  ]);
  const ok = db === "ok" && storage === "ok";
  return c.json({ ok, db, storage }, ok ? 200 : 503, { "cache-control": "no-store" });
});
app.get("/config", (c) => c.json(appConfig(c.env)));

// The app's "who am I" check: null when signed out, rather than a 401 every signed-out page load would log as an error.
// /api/me keeps answering 401 for scripts and assistants.
app.get("/session", withDb, async (c) => {
  const who = await resolveUser(c);
  return c.json(who ? await loadMe(c.get("db"), who.userId) : null, 200, { "cache-control": "no-store" });
});

app.use("*", withDb, requireUser, limitRate);
app.route("/", me);
app.route("/", study);
app.route("/decks", decks);
app.route("/public/decks", publicDecks);
app.route("/cards", cards);
app.route("/stats", stats);
app.route("/achievements", achievements);
app.route("/", games);
app.route("/images", images);
app.route("/tokens", tokens);
app.all("/mcp", (c) => handleMcp(c, app));

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch(request, env, ctx) {
    // Only /api/* and the shareable pages reach the Worker (assets.run_worker_first in wrangler.jsonc).
    if (new URL(request.url).pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    return servePage(request, env);
  },
} satisfies ExportedHandler<Env>;
