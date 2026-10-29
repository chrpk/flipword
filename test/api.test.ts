import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PHOTO_STORAGE_BYTES } from "../shared/images";
import { LEECH_THRESHOLD, Rating, State } from "../shared/srs";
import { createAuth } from "../worker/auth";
import { servePage } from "../worker/pages";
import type {
  Achievements,
  CardDto,
  CardList,
  CardProgress,
  DeckSummary,
  GameBest,
  ImportResult,
  Me,
  PracticeResult,
  PublicCardList,
  PublicDeck,
  PublicDeckList,
  ReviewResult,
  Stats,
  StudyQueue,
} from "../shared/types";

const ORIGIN = "http://localhost";
let cookie = "";

async function api<T = unknown>(path: string, init: RequestInit = {}, expected = 200): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("origin", ORIGIN);
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await exports.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }));
  const text = await res.text();
  expect(res.status, `${init.method ?? "GET"} ${path} → ${text}`).toBe(expected);
  return (text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text) as T;
}

const post = <T>(path: string, body: unknown, expected = 200) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) }, expected);

beforeAll(async () => {
  const res = await exports.default.fetch(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: "learner@example.com", password: "correct-horse-battery", name: "Learner" }),
    }),
  );
  expect(res.status).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});

/** Runs `fn` as a brand-new user, so daily limits and counts start from zero. */
async function asNewUser<T>(fn: () => Promise<T>): Promise<T> {
  const saved = cookie;
  const res = await exports.default.fetch(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: `u${crypto.randomUUID()}@example.com`, password: "a-long-test-password", name: "U" }),
    }),
  );
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  try {
    return await fn();
  } finally {
    cookie = saved;
  }
}
const patch = (path: string, body: unknown) => api(path, { method: "PATCH", body: JSON.stringify(body) });

describe("api", () => {
  it("rejects anonymous requests", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/decks`));
    expect(res.status).toBe(401);
  });

  it("exposes public config", async () => {
    const saved = cookie;
    cookie = "";
    const config = await api<{ devLogin: boolean; providers: string[] }>("/api/config");
    cookie = saved;
    expect(config).toEqual({ devLogin: true, providers: ["google", "facebook"], operator: { name: "", email: "" } });
  });

  it("answers the session check with the user, or null when signed out", async () => {
    const session = (headers: HeadersInit) => exports.default.fetch(new Request(`${ORIGIN}/api/session`, { headers }));
    const out = await session({});
    expect(out.status).toBe(200);
    expect(await out.json()).toBeNull();
    expect(await (await session({ authorization: "Bearer fw_not-a-token" })).json()).toBeNull();
    const signedIn = await (await session({ cookie })).json();
    expect(signedIn).toEqual(await api("/api/me"));
    expect(signedIn).toMatchObject({ user: { name: "Learner" } });
    // /api/me itself still says 401 to scripts without credentials.
    expect((await exports.default.fetch(new Request(`${ORIGIN}/api/me`))).status).toBe(401);
  });

  it("reports health of the database and photo storage", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/health`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "ok", storage: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const failing = vi.spyOn(env.DB, "prepare").mockImplementationOnce(() => {
      throw new Error("D1 down");
    });
    try {
      const down = await exports.default.fetch(new Request(`${ORIGIN}/api/health`));
      expect(down.status).toBe(503);
      expect(await down.json()).toEqual({ ok: false, db: "error", storage: "ok" });
    } finally {
      failing.mockRestore();
    }
  });

  it("adds absolute link-preview tags to shareable pages", async () => {
    // The test runtime has no static assets; stand in for the SPA's index.html (and a non-HTML file).
    const ASSETS = {
      fetch: async (req: Request) =>
        new URL(req.url).pathname === "/logo.svg"
          ? new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } })
          : new Response('<html><head><meta name="twitter:card" content="summary" /></head><body></body></html>', {
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
    };
    const page = (url: string) => servePage(new Request(url), { ...env, ASSETS } as unknown as Env);

    const html = await (await page("https://flip.example/shared/abc")).text();
    expect(html).toContain('<meta property="og:image" content="https://flip.example/og-image.png" />');
    expect(html).toContain('<meta property="og:url" content="https://flip.example/shared/abc" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(await (await page("https://flip.example/logo.svg")).text()).toBe("<svg/>");
  });

  it("sends security headers on API responses", async () => {
    const res = await exports.default.fetch(new Request(`${ORIGIN}/api/health`));
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("rate-limits sign-in attempts per client IP, with counters in D1", async () => {
    // Tests run with dev login, which switches the limiter off; build the production configuration instead.
    const auth = createAuth({ ...env, DEV_LOGIN: "false" });
    const attempt = (ip: string) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": ip },
          body: JSON.stringify({ provider: "google", callbackURL: "/" }),
        }),
      );
    const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt(ip)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    // Other clients aren't affected.
    expect((await attempt("198.51.100.7")).status).toBe(200);
    const { results } = await env.DB.prepare("select count(*) as n from rate_limit where key like ?").bind(`${ip}%`).all();
    expect(results[0].n).toBeGreaterThan(0);
  });

  it("limits API requests per user", async () => {
    const limit = vi.spyOn(env.API_RATE_LIMITER, "limit").mockResolvedValueOnce({ success: false });
    try {
      const res = await exports.default.fetch(new Request(`${ORIGIN}/api/decks`, { headers: { cookie } }));
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("60");
      expect(limit).toHaveBeenCalledWith({ key: expect.any(String) });
    } finally {
      limit.mockRestore();
    }
    await api("/api/decks");
  });

  it.each([
    ["google", "https://accounts.google.com/"],
    ["facebook", "https://www.facebook.com/"],
  ])("starts %s sign-in with the right callback", async (provider, host) => {
    const res = await exports.default.fetch(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: "/" }),
      }),
    );
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url.startsWith(host)).toBe(true);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/${provider}`);
  });

  it("returns default settings and persists changes", async () => {
    const me = await api<Me>("/api/me");
    expect(me.user.email).toBe("learner@example.com");
    expect(me.settings).toMatchObject({ newPerDay: 20, targetLang: "es", onboarded: false });

    const settings = await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ targetLang: "de", newPerDay: 2, onboarded: true }),
    });
    expect(settings).toMatchObject({ targetLang: "de", newPerDay: 2, onboarded: true, maxReviewsPerDay: 200 });
  });

  it("runs a full deck → study → undo cycle", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "German basics" }, 201);
    expect(deck).toMatchObject({ name: "German basics", total: 0 });

    await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "der Hund", back: "the dog" }, 201);
    const imported = await post<ImportResult>(`/api/decks/${deck.id}/cards/bulk`, {
      cards: [
        { front: "Der Hund", back: "duplicate" },
        { front: "die Katze", back: "the cat", example: "Die Katze schläft." },
        { front: "das Haus", back: "the house" },
        { front: "das Haus", back: "duplicate within batch" },
      ],
    });
    expect(imported).toEqual({ created: 2, skipped: 2 });

    // Large batches are split across statements to stay under D1's bound-parameter limit.
    const bulk = await post<ImportResult>(`/api/decks/${deck.id}/cards/bulk`, {
      cards: Array.from({ length: 120 }, (_, i) => ({ front: `Wort ${i}`, back: `word ${i}` })),
    });
    expect(bulk).toEqual({ created: 120, skipped: 0 });
    const bulkList = await api<CardList>(`/api/decks/${deck.id}/cards?q=Wort&limit=1`);
    expect(bulkList.total).toBe(120);

    const list = await api<CardList>(`/api/decks/${deck.id}/cards?q=katz`);
    expect(list.total).toBe(1);
    expect(list.cards[0].example).toBe("Die Katze schläft.");

    // Daily new limit was set to 2.
    const summary = await api<DeckSummary>(`/api/decks/${deck.id}`);
    expect(summary).toMatchObject({ total: 123, newCount: 2, learningCount: 0, reviewCount: 0 });

    const queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
    expect(queue.learning).toHaveLength(0);
    expect(queue.queue.map((c) => c.front)).toEqual(["der Hund", "die Katze"]);

    const first = queue.queue[0];
    const graded = await post<ReviewResult>("/api/reviews", {
      cardId: first.id,
      rating: Rating.Good,
      reviewedAt: Date.now(),
      durationMs: 3000,
    });
    expect(graded.card.state).toBe(State.Learning);
    expect(graded.card.reps).toBe(1);

    const after = await api<DeckSummary>(`/api/decks/${deck.id}`);
    expect(after).toMatchObject({ newCount: 1, learningCount: 1 });

    const stats = await api<Stats>("/api/stats");
    expect(stats.today.reviews).toBe(1);
    expect(stats.today.durationMs).toBe(3000);
    expect(stats.streak).toBe(1);
    expect(stats.states).toMatchObject({ new: 122, learning: 1 });

    const restored = await post<CardDto>("/api/reviews/undo", { logId: graded.logId });
    expect(restored).toMatchObject({ state: State.New, reps: 0 });
    const undone = await api<DeckSummary>(`/api/decks/${deck.id}`);
    expect(undone).toMatchObject({ newCount: 2, learningCount: 0 });

    const csv = await api<string>(`/api/decks/${deck.id}/export`);
    expect(csv).toContain('die Katze,the cat,Die Katze schläft.');

    await api(`/api/decks/${deck.id}`, { method: "DELETE" }, 204);
    await api(`/api/decks/${deck.id}`, {}, 404);
    await api(`/api/cards/${first.id}`, {}, 404);
  });

  it("studies reversed decks one direction per word per day", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Both ways", reverseCards: true }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "la luna", back: "the moon" }, 201);
    expect(word).toMatchObject({ reverse: false, noteId: word.id });

    const summary = await api<DeckSummary>(`/api/decks/${deck.id}`);
    expect(summary.total).toBe(1);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards`)).total).toBe(1);

    const queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
    expect(queue.queue).toHaveLength(1);
    expect(queue.queue[0].reverse).toBe(false);

    await post<ReviewResult>("/api/reviews", { cardId: word.id, rating: Rating.Easy, reviewedAt: Date.now() });
    // The reverse card is buried for the rest of the day.
    const after = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
    expect(after.queue).toHaveLength(0);

    // Editing text updates both directions.
    await api(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ back: "the Moon" }) });
    const rows = await env.DB.prepare("select back, reverse from card where note_id = ? order by reverse").bind(word.id).all();
    expect(rows.results).toEqual([
      { back: "the Moon", reverse: 0 },
      { back: "the Moon", reverse: 1 },
    ]);

    // Turning the option off removes reverse cards; turning it on recreates them.
    await api(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ reverseCards: false }) });
    const countRows = () => env.DB.prepare("select count(*) as n from card where note_id = ?").bind(word.id).first<{ n: number }>();
    expect((await countRows())?.n).toBe(1);
    const patched = await api<DeckSummary>(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ reverseCards: true }) });
    expect(patched.description).toBe("");
    expect((await countRows())?.n).toBe(2);

    await api(`/api/cards/${word.id}`, { method: "DELETE" }, 204);
    expect((await countRows())?.n).toBe(0);
  });

  it("suspends words without touching other fields", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Suspend", description: "keep me" }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "el río", back: "the river", example: "Nado en el río." }, 201);

    const suspended = await api<CardDto>(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ suspended: true }) });
    expect(suspended).toMatchObject({ suspended: true, example: "Nado en el río.", front: "el río" });
    expect((await api<DeckSummary>(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ name: "Renamed" }) })).description).toBe("keep me");

    expect((await api<StudyQueue>(`/api/study?deckId=${deck.id}`)).queue).toHaveLength(0);
    expect(await api<DeckSummary>(`/api/decks/${deck.id}`)).toMatchObject({ total: 1, newCount: 0 });
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?filter=suspended`)).total).toBe(1);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?filter=new`)).total).toBe(0);
  });

  it("suspends leeches and lifts the suspension on undo", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Leeches", reverseCards: true }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "el ferrocarril", back: "the railway" }, 201);
    const now = Date.now();
    await env.DB.prepare(
      "update card set state = ?, lapses = ?, reps = 20, stability = 3, difficulty = 8, last_review = ?, due = ? where id = ?",
    )
      .bind(State.Review, LEECH_THRESHOLD - 1, now - 3 * 86_400_000, now - 1000, word.id)
      .run();

    const graded = await post<ReviewResult>("/api/reviews", { cardId: word.id, rating: Rating.Again, reviewedAt: now });
    expect(graded.leech).toBe(true);
    expect(graded.card).toMatchObject({ suspended: true, lapses: LEECH_THRESHOLD });
    const sibling = await env.DB.prepare("select suspended from card where note_id = ? and reverse = 1").bind(word.id).first();
    expect(sibling).toEqual({ suspended: 1 });

    const restored = await post<CardDto>("/api/reviews/undo", { logId: graded.logId });
    expect(restored).toMatchObject({ suspended: false, lapses: LEECH_THRESHOLD - 1 });
    const siblingAfter = await env.DB.prepare("select suspended from card where note_id = ? and reverse = 1").bind(word.id).first();
    expect(siblingAfter).toEqual({ suspended: 0 });

    // After the user unsuspends a leech, the next lapse doesn't re-suspend it (Anki: again only at 12, 16, …).
    const relapse = await post<ReviewResult>("/api/reviews", { cardId: word.id, rating: Rating.Again, reviewedAt: Date.now() });
    expect(relapse.leech).toBe(true);
    await api(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ suspended: false }) });
    await env.DB.prepare("update card set state = ?, due = ?, last_review = ? where id = ?")
      .bind(State.Review, Date.now() - 1000, Date.now() - 86_400_000, word.id)
      .run();
    const ninth = await post<ReviewResult>("/api/reviews", { cardId: word.id, rating: Rating.Again, reviewedAt: Date.now() });
    expect(ninth.leech).toBe(false);
    expect(ninth.card).toMatchObject({ lapses: LEECH_THRESHOLD + 1, suspended: false });
  });

  it("tracks right and wrong answers per word across study and games", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Progress", reverseCards: true }, 201);
    const words = await post<ImportResult>(`/api/decks/${deck.id}/cards/bulk`, {
      cards: ["uno", "dos", "tres", "cuatro", "cinco"].map((w, i) => ({ front: w, back: String(i + 1) })),
    });
    expect(words.created).toBe(5);

    const dealt = await api<CardDto[]>(`/api/decks/${deck.id}/play?count=10`);
    expect(dealt).toHaveLength(5);
    expect(dealt.every((c) => !c.reverse)).toBe(true);

    const target = dealt.find((c) => c.front === "uno")!;
    const reverse = await env.DB.prepare("select id from card where note_id = ? and reverse = 1").bind(target.id).first<{ id: string }>();
    // Study: one wrong answer on the forward card, one right answer on the reverse card.
    await post("/api/reviews", { cardId: target.id, rating: Rating.Again, reviewedAt: Date.now() });
    await post("/api/reviews", { cardId: reverse!.id, rating: Rating.Good, reviewedAt: Date.now() });

    const first = await post<PracticeResult>("/api/practice", {
      deckId: deck.id,
      game: "quiz",
      score: 3,
      durationMs: 20_000,
      answers: [
        { cardId: target.id, correct: true },
        { cardId: target.id, correct: true },
        { cardId: "someone-elses-card", correct: true },
      ],
    });
    expect(first).toEqual({ best: 3, isBest: true });
    const worse = await post<PracticeResult>("/api/practice", { deckId: deck.id, game: "quiz", score: 1, durationMs: 1, answers: [] });
    expect(worse).toEqual({ best: 3, isBest: false });
    // Timed games keep the lowest score.
    await post("/api/practice", { deckId: deck.id, game: "match", score: 9000, durationMs: 9000, answers: [] });
    const faster = await post<PracticeResult>("/api/practice", { deckId: deck.id, game: "match", score: 7000, durationMs: 7000, answers: [] });
    expect(faster).toEqual({ best: 7000, isBest: true });

    const bests = await api<GameBest[]>(`/api/decks/${deck.id}/games`);
    expect(bests.find((b) => b.game === "quiz")).toEqual({ game: "quiz", best: 3, plays: 2 });
    expect(bests.find((b) => b.game === "match")).toEqual({ game: "match", best: 7000, plays: 2 });
    expect(bests.find((b) => b.game === "spell")).toEqual({ game: "spell", best: null, plays: 0 });

    const list = await api<CardList>(`/api/decks/${deck.id}/cards?q=uno`);
    expect(list.cards[0]).toMatchObject({ front: "uno", correctCount: 3, wrongCount: 1 });

    const progress = await api<CardProgress>(`/api/cards/${target.id}/progress`);
    expect(progress.reviews).toEqual({ correct: 1, wrong: 1 });
    expect(progress.games).toEqual({ correct: 2, wrong: 0 });
    expect(progress.recent).toHaveLength(4);
    expect(progress.recent[0].source).toBe("quiz");

    await post("/api/practice", { deckId: deck.id, game: "chess", score: 1, durationMs: 1, answers: [] }, 400);
  });

  it("lets users mark words as learned", async () => {
    // Earlier tests used up a small daily new-card limit.
    await api("/api/settings", { method: "PATCH", body: JSON.stringify({ newPerDay: 100 }) });
    const deck = await post<DeckSummary>("/api/decks", { name: "Learned", reverseCards: true }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "el sol", back: "the sun", example: "Hace sol." }, 201);
    await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "la luna", back: "the moon" }, 201);

    const learned = await api<CardDto>(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ learned: true }) });
    expect(learned.learnedAt).toBeTypeOf("number");
    expect(learned.example).toBe("Hace sol.");
    const both = await env.DB.prepare("select count(*) as n from card where note_id = ? and learned_at is not null").bind(word.id).first();
    expect(both).toEqual({ n: 2 });

    // Learned words leave daily study and the due counts but stay in the deck. Counts match what a session offers:
    // one card per word, even with reverse cards on.
    expect(await api<DeckSummary>(`/api/decks/${deck.id}`)).toMatchObject({ total: 2, learnedCount: 1, newCount: 1 });
    const queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
    expect(queue.queue.map((c) => c.front)).toEqual(["la luna"]);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?filter=learned`)).cards.map((c) => c.front)).toEqual(["el sol"]);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?filter=new`)).total).toBe(1);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards`)).total).toBe(2);
    expect((await api<Stats>("/api/stats")).learned).toBeGreaterThanOrEqual(1);

    // Games still use learned words.
    expect((await api<CardDto[]>(`/api/decks/${deck.id}/play?count=10`)).map((c) => c.front).sort()).toEqual(["el sol", "la luna"]);

    // Marking again keeps the original date; unmarking puts the word back into study.
    const again = await api<CardDto>(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ learned: true }) });
    expect(again.learnedAt).toBe(learned.learnedAt);
    await api(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ learned: false }) });
    expect(await api<DeckSummary>(`/api/decks/${deck.id}`)).toMatchObject({ learnedCount: 0, newCount: 2 });

    // Resetting progress also clears the learned mark.
    await api(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ learned: true }) });
    const reset = await post<CardDto>(`/api/cards/${word.id}/reset`, {});
    expect(reset.learnedAt).toBeNull();
  });

  it("stores, serves and cleans up card photos", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Photos", reverseCards: true }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "el árbol", back: "the tree" }, 201);
    expect(word.imageKey).toBeNull();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const upload = (body: BodyInit, type: string, expected = 200) =>
      api<CardDto>(`/api/cards/${word.id}/image`, { method: "PUT", body, headers: { "content-type": type } }, expected);

    const withPhoto = await upload(png, "image/png");
    expect(withPhoto.imageKey).toMatch(/\.png$/);
    const sibling = await env.DB.prepare("select image_key from card where note_id = ? and reverse = 1").bind(word.id).first();
    expect(sibling).toEqual({ image_key: withPhoto.imageKey });

    const res = await exports.default.fetch(
      new Request(`${ORIGIN}/api/images/${withPhoto.imageKey}`, { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);

    // Other users can't load it.
    const other = await exports.default.fetch(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ email: "other@example.com", password: "another-long-password", name: "Other" }),
      }),
    );
    const otherCookie = other.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const stolen = await exports.default.fetch(
      new Request(`${ORIGIN}/api/images/${withPhoto.imageKey}`, { headers: { cookie: otherCookie } }),
    );
    expect(stolen.status).toBe(404);

    // Only images, and only small ones.
    await upload("<script>alert(1)</script>", "text/html", 415);
    await upload("<svg/>", "image/svg+xml", 415);
    await upload(new Uint8Array(2 * 1024 * 1024 + 1), "image/jpeg", 413);

    // Replacing removes the old file; removing clears both directions.
    const replaced = await upload(png, "image/webp");
    expect(await env.IMAGES.get(withPhoto.imageKey!)).toBeNull();
    expect(await env.IMAGES.head(replaced.imageKey!)).not.toBeNull();
    const removed = await api<CardDto>(`/api/cards/${word.id}/image`, { method: "DELETE" });
    expect(removed.imageKey).toBeNull();
    expect(await env.IMAGES.head(replaced.imageKey!)).toBeNull();

    // Deleting the word or the deck deletes its photos.
    const again = await upload(png, "image/jpeg");
    await api(`/api/cards/${word.id}`, { method: "DELETE" }, 204);
    expect(await env.IMAGES.head(again.imageKey!)).toBeNull();
    const second = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "la flor", back: "the flower" }, 201);
    const secondPhoto = await api<CardDto>(`/api/cards/${second.id}/image`, {
      method: "PUT",
      body: png,
      headers: { "content-type": "image/png" },
    });
    await api(`/api/decks/${deck.id}`, { method: "DELETE" }, 204);
    expect(await env.IMAGES.head(secondPhoto.imageKey!)).toBeNull();
  });

  it("flags words with named colours", async () => {
    const me = await api<Me>("/api/me");
    expect(me.settings.flagNames).toEqual(["", "", "", "", ""]);
    const named = await api<Me["settings"]>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ flagNames: ["Tricky", "", "Verbs", "", ""] }),
    });
    expect(named.flagNames).toEqual(["Tricky", "", "Verbs", "", ""]);
    // Other settings are untouched by a flag-name update.
    expect(named.newPerDay).toBe(me.settings.newPerDay);

    const deck = await post<DeckSummary>("/api/decks", { name: "Flags", reverseCards: true }, 201);
    const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "correr", back: "to run" }, 201);
    await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "la mesa", back: "the table" }, 201);
    expect(word.flag).toBe(0);

    const flagged = await api<CardDto>(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ flag: 3 }) });
    expect(flagged).toMatchObject({ flag: 3, front: "correr", example: "" });
    const both = await env.DB.prepare("select flag from card where note_id = ? order by reverse").bind(word.id).all();
    expect(both.results).toEqual([{ flag: 3 }, { flag: 3 }]);

    const byFlag = await api<CardList>(`/api/decks/${deck.id}/cards?flag=3`);
    expect(byFlag.cards.map((c) => c.front)).toEqual(["correr"]);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?flag=3&filter=new`)).total).toBe(1);
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?flag=1`)).total).toBe(0);

    // Turning reverse cards off and on keeps the flag.
    await api(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ reverseCards: false }) });
    await api(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ reverseCards: true }) });
    const again = await env.DB.prepare("select flag from card where note_id = ? and reverse = 1").bind(word.id).first();
    expect(again).toEqual({ flag: 3 });

    await api(`/api/cards/${word.id}`, { method: "PATCH", body: JSON.stringify({ flag: 6 }) }, 400);
    await api("/api/settings", { method: "PATCH", body: JSON.stringify({ flagNames: ["a"] }) }, 400);
    await api(`/api/decks/${deck.id}/cards?flag=9`, {}, 400);
  });

  it("issues personal access tokens that work as bearer auth", async () => {
    const created = await post<{ id: string; token: string; prefix: string }>("/api/tokens", { name: "Claude Code" }, 201);
    expect(created.token).toMatch(/^fw_[A-Za-z0-9_-]{40,}$/);
    expect(created.token.startsWith(created.prefix)).toBe(true);
    // Only a hash is stored.
    const stored = await env.DB.prepare("select token_hash from api_token where id = ?").bind(created.id).first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toContain(created.token);

    const bearer = (path: string, init: RequestInit = {}) =>
      exports.default.fetch(
        new Request(`${ORIGIN}${path}`, {
          ...init,
          headers: { authorization: `Bearer ${created.token}`, "content-type": "application/json", ...init.headers },
        }),
      );
    expect((await bearer("/api/decks")).status).toBe(200);
    // Tokens can't manage tokens.
    expect((await bearer("/api/tokens")).status).toBe(403);
    expect((await bearer("/api/tokens", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(403);

    const list = await api<{ id: string; name: string; lastUsedAt: number | null }[]>("/api/tokens");
    expect(list.find((t) => t.id === created.id)).toMatchObject({ name: "Claude Code" });
    expect(JSON.stringify(list)).not.toContain(created.token);

    await api(`/api/tokens/${created.id}`, { method: "DELETE" }, 204);
    expect((await bearer("/api/decks")).status).toBe(401);
    expect(
      (await exports.default.fetch(new Request(`${ORIGIN}/api/decks`, { headers: { authorization: "Bearer fw_nope" } }))).status,
    ).toBe(401);
  });

  it("lets MCP clients manage decks and cards", async () => {
    const { token } = await post<{ token: string }>("/api/tokens", { name: "MCP test" }, 201);
    let id = 0;
    const rpc = async (method: string, params?: unknown) => {
      const res = await exports.default.fetch(
        new Request(`${ORIGIN}/api/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        }),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { result?: any; error?: unknown };
    };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const { result } = await rpc("tools/call", { name, arguments: args });
      return { isError: !!result.isError, data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
    };

    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.result.serverInfo.name).toBe("flipword");
    const tools = (await rpc("tools/list")).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(
      expect.arrayContaining([
        "list_decks",
        "create_deck",
        "update_deck",
        "delete_deck",
        "search_public_decks",
        "list_public_deck_cards",
        "copy_public_deck",
        "list_cards",
        "add_card",
        "add_cards",
        "update_card",
        "delete_card",
      ]),
    );

    const deck = (await call("create_deck", { name: "From MCP", reverse_cards: true })).data;
    expect(deck).toMatchObject({ name: "From MCP", reverse_cards: true, words: 0, visibility: "private" });

    const bulk = await call("add_cards", {
      deck_id: deck.id,
      cards: Array.from({ length: 620 }, (_, i) => ({ front: `palabra ${i}`, back: `word ${i}` })).concat([{ front: "Palabra 1", back: "dup" }]),
    });
    expect(bulk.data).toEqual({ created: 620, skipped: 1 });

    const one = (await call("add_card", { deck_id: deck.id, front: "el gato", back: "the cat", example: "El gato duerme." })).data;
    expect(one).toMatchObject({ front: "el gato", status: "new" });

    const updated = (await call("update_card", { card_id: one.id, back: "the cat (m.)", learned: true, flag: 2 })).data;
    expect(updated).toMatchObject({ back: "the cat (m.)", status: "learned", flag: 2, example: "El gato duerme." });

    const found = (await call("list_cards", { deck_id: deck.id, query: "gato" })).data;
    expect(found.total).toBe(1);
    expect(found.words[0]).toMatchObject({ front: "el gato", answered_right: 0, answered_wrong: 0 });

    const renamed = (await call("update_deck", { deck_id: deck.id, name: "Renamed via MCP" })).data;
    expect(renamed).toMatchObject({ name: "Renamed via MCP", words: 621, learned: 1 });
    expect((await call("list_decks")).data.some((d: { id: string }) => d.id === deck.id)).toBe(true);

    expect((await call("search_public_decks", { query: "Renamed via MCP" })).data).toEqual({ total: 0, decks: [] });
    expect((await call("update_deck", { deck_id: deck.id, visibility: "public" })).data.visibility).toBe("public");
    const shared = (await call("search_public_decks", { query: "Renamed via MCP" })).data;
    expect(shared.decks).toEqual([{ id: deck.id, name: "Renamed via MCP", words: 621, author: "Learner", own_deck: true }]);
    const preview = (await call("list_public_deck_cards", { deck_id: deck.id, query: "gato" })).data;
    expect(preview).toMatchObject({ total: 1, words: [{ front: "el gato", back: "the cat (m.)", example: "El gato duerme." }] });
    const copy = (await call("copy_public_deck", { deck_id: deck.id })).data;
    expect(copy).toMatchObject({ name: "Renamed via MCP", visibility: "private", words: 621, learned: 0 });
    expect((await call("delete_deck", { deck_id: copy.id })).isError).toBe(false);

    expect((await call("delete_card", { card_id: one.id })).data).toEqual({ deleted: one.id });
    const missing = await call("update_card", { card_id: one.id, back: "x" });
    expect(missing.isError).toBe(true);
    expect(missing.data).toContain("404");
    // Invalid arguments are rejected before reaching the API.
    expect((await call("add_card", { deck_id: deck.id, front: "", back: "x" })).isError).toBe(true);

    expect((await call("delete_deck", { deck_id: deck.id })).data).toEqual({ deleted: deck.id });
    expect((await call("list_cards", { deck_id: deck.id })).isError).toBe(true);

    // Without credentials the endpoint refuses.
    const anon = await exports.default.fetch(
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(anon.status).toBe(401);
  });

  describe("review fixes", () => {
    it("limits new cards and reviews per word, not per card, and counts match the session (#1, #3)", () =>
      asNewUser(async () => {
        await patch("/api/settings", { newPerDay: 20 });
        const deck = await post<DeckSummary>("/api/decks", { name: "Both", reverseCards: true }, 201);
        await post(`/api/decks/${deck.id}/cards/bulk`, {
          cards: Array.from({ length: 30 }, (_, i) => ({ front: `w${String(i).padStart(2, "0")}`, back: `m${i}` })),
        });

        let summary = await api<DeckSummary>(`/api/decks/${deck.id}`);
        let queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
        expect(summary.newCount).toBe(20);
        expect(queue.queue).toHaveLength(20);
        expect(new Set(queue.queue.map((c) => c.noteId)).size).toBe(20);
        expect(queue.queue.every((c) => !c.reverse)).toBe(true);

        // Answer one word: its reverse is buried, it's in learning, 19 new words remain for today.
        await post("/api/reviews", { cardId: queue.queue[0].id, rating: Rating.Good, reviewedAt: Date.now(), sentAt: Date.now() });
        summary = await api<DeckSummary>(`/api/decks/${deck.id}`);
        queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
        expect(summary).toMatchObject({ newCount: 19, learningCount: 1 });
        expect(queue.queue).toHaveLength(19);
        expect(queue.learning).toHaveLength(1);
        expect(queue.queue.some((c) => c.noteId === queue.learning[0].noteId)).toBe(false);

        // Both directions of a word due for review: only one is offered and counted.
        const both = queue.queue[1].noteId;
        const now = Date.now();
        await env.DB.prepare(
          "update card set state = ?, stability = 5, difficulty = 5, reps = 2, due = ? - (reverse * 1000) - 5000, last_review = ? where note_id = ?",
        )
          .bind(State.Review, now, now - 3 * 86_400_000, both)
          .run();
        summary = await api<DeckSummary>(`/api/decks/${deck.id}`);
        queue = await api<StudyQueue>(`/api/study?deckId=${deck.id}`);
        const offered = queue.queue.filter((c) => c.noteId === both);
        expect(offered).toHaveLength(1);
        expect(offered[0].reverse).toBe(true); // the earlier-due direction
        expect(summary.reviewCount).toBe(1);
      }));

    it("bulk-inserts large imports in a few statements with correct defaults (#2)", () =>
      asNewUser(async () => {
        const deck = await post<DeckSummary>("/api/decks", { name: "Big", reverseCards: true }, 201);
        const long = "x".repeat(1500);
        const res = await post<ImportResult>(`/api/decks/${deck.id}/cards/bulk`, {
          cards: Array.from({ length: 500 }, (_, i) => ({ front: `big ${i}`, back: long, example: long })),
        });
        expect(res).toEqual({ created: 500, skipped: 0 });
        const rows = await env.DB.prepare(
          "select count(*) as n, sum(reverse) as rev, sum(state) as st, sum(flag) as fl, sum(due != created_at) as d, sum(suspended) as su from card where deck_id = ?",
        )
          .bind(deck.id)
          .first();
        expect(rows).toEqual({ n: 1000, rev: 500, st: 0, fl: 0, d: 0, su: 0 });
        const list = await api<CardList>(`/api/decks/${deck.id}/cards?limit=1`);
        expect(list.cards[0]).toMatchObject({ front: "big 499", back: long, example: long, learnedAt: null, imageKey: null });
      }));

    it("leaves suspended cards out of the forecast and state counts (#4)", () =>
      asNewUser(async () => {
        const deck = await post<DeckSummary>("/api/decks", { name: "Forecast" }, 201);
        const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "uno", back: "one" }, 201);
        await env.DB.prepare("update card set state = ?, due = ? where id = ?")
          .bind(State.Review, Date.now() + 86_400_000, word.id)
          .run();
        const sum = (s: Stats) => s.forecast.reduce((n, d) => n + d.due, 0);
        expect(sum(await api<Stats>("/api/stats"))).toBe(1);
        await patch(`/api/cards/${word.id}`, { suspended: true });
        const stats = await api<Stats>("/api/stats");
        expect(sum(stats)).toBe(0);
        expect(stats.states.review).toBe(0);
      }));

    it("neutralises spreadsheet formulas in CSV exports (#6)", () =>
      asNewUser(async () => {
        const deck = await post<DeckSummary>("/api/decks", { name: "Formulas" }, 201);
        await post(`/api/decks/${deck.id}/cards`, { front: '=HYPERLINK("http://evil","x")', back: "+1", example: "@SUM(A1)" }, 201);
        await post(`/api/decks/${deck.id}/cards`, { front: "-ing", back: "suffix" }, 201);
        const csv = await api<string>(`/api/decks/${deck.id}/export`);
        expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")",'+1,'@SUM(A1)`);
        expect(csv).toContain("'-ing,suffix,");
        expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
      }));

    it("uses the saved time zone when a request has no offset header (#8)", () =>
      asNewUser(async () => {
        const { token } = await post<{ token: string }>("/api/tokens", { name: "tz" }, 201);
        const today = async (timeZone: string) => {
          await patch("/api/settings", { timeZone });
          const res = await exports.default.fetch(
            new Request(`${ORIGIN}/api/stats`, { headers: { authorization: `Bearer ${token}` } }),
          );
          return ((await res.json()) as Stats).forecast[0].day;
        };
        // UTC+14 and UTC-11 are always on different calendar days.
        const expected = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
        const east = await today("Pacific/Kiritimati");
        const west = await today("Pacific/Pago_Pago");
        expect(east).toBe(expected("Pacific/Kiritimati"));
        expect(west).toBe(expected("Pacific/Pago_Pago"));
        expect(east).not.toBe(west);
        await api("/api/settings", { method: "PATCH", body: JSON.stringify({ timeZone: "Mars/Olympus" }) }, 400);
      }));

    it("keeps the reveal time for answers left open a long time (#9)", () =>
      asNewUser(async () => {
        const deck = await post<DeckSummary>("/api/decks", { name: "Slow" }, 201);
        const word = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "lento", back: "slow" }, 201);
        const revealed = Date.now() - 15 * 60_000;
        const res = await post<ReviewResult>("/api/reviews", {
          cardId: word.id,
          rating: Rating.Good,
          reviewedAt: revealed,
          sentAt: Date.now(),
        });
        expect(res.card.lastReview).toBe(revealed);
      }));
  });

  it("unlocks achievements once and keeps them", () =>
    asNewUser(async () => {
      const unlockedIds = (a: Achievements) => a.tracks.flatMap((t) => t.tiers.filter((x) => x.unlockedAt).map((x) => x.id));
      const start = await api<Achievements>("/api/achievements");
      expect(start).toMatchObject({ currentStreak: 0, studiedToday: false, unseen: [] });
      expect(start.tracks.map((t) => t.track)).toEqual(["streak", "words", "reviews", "games"]);
      expect(unlockedIds(start)).toEqual([]);

      // 12 learned words; reviews on the three days before today and one today: a 4-day streak.
      const { user } = await api<Me>("/api/me");
      const deck = await post<DeckSummary>("/api/decks", { name: "Milestones", reverseCards: true }, 201);
      await post(`/api/decks/${deck.id}/cards/bulk`, {
        cards: Array.from({ length: 12 }, (_, i) => ({ front: `m${i}`, back: `${i}` })),
      });
      await env.DB.prepare("update card set learned_at = ? where deck_id = ?").bind(Date.now(), deck.id).run();
      const word = await env.DB.prepare("select id from card where deck_id = ? and reverse = 0 limit 1").bind(deck.id).first<{ id: string }>();
      for (const daysAgo of [1, 2, 3]) {
        await env.DB.prepare(
          `insert into review_log (id, card_id, user_id, rating, state, due, stability, difficulty, elapsed_days,
            last_elapsed_days, scheduled_days, learning_steps, review) values (?, ?, ?, 3, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        )
          .bind(crypto.randomUUID(), word!.id, user.id, Date.now() - daysAgo * 86_400_000)
          .run();
      }
      let a = await api<Achievements>("/api/achievements");
      expect(a).toMatchObject({ currentStreak: 3, studiedToday: false });
      await post("/api/reviews", { cardId: word!.id, rating: Rating.Good, reviewedAt: Date.now(), sentAt: Date.now() });

      a = await api<Achievements>("/api/achievements");
      expect(a).toMatchObject({ currentStreak: 4, studiedToday: true, unseen: ["streak-3", "words-10"] });
      expect(a.tracks.find((t) => t.track === "words")!.value).toBe(12);
      expect(unlockedIds(a)).toEqual(["streak-3", "words-10"]);
      const unlockedAt = a.tracks[0].tiers[0].unlockedAt;

      // Announced once: marking seen clears them, and other users' ids are ignored.
      await post("/api/achievements/seen", { ids: ["streak-3", "words-10"] }, 204);
      a = await api<Achievements>("/api/achievements");
      expect(a.unseen).toEqual([]);
      expect(a.tracks[0].tiers[0].unlockedAt).toBe(unlockedAt);

      // Kept even when the number drops again.
      await env.DB.prepare("update card set learned_at = null where deck_id = ?").bind(deck.id).run();
      a = await api<Achievements>("/api/achievements");
      expect(a.tracks.find((t) => t.track === "words")!.value).toBe(0);
      expect(unlockedIds(a)).toContain("words-10");

      // Finishing a game unlocks the first games tier.
      await post("/api/practice", { deckId: deck.id, game: "quiz", score: 1, durationMs: 1000, answers: [] });
      expect((await api<Achievements>("/api/achievements")).unseen).toEqual(["games-1"]);
      await post("/api/achievements/seen", { ids: Array.from({ length: 101 }, () => "x") }, 400);
    }));

  it("keeps decks private by default and lets public ones be found, viewed and copied", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const words = [
      { front: "la manzana", back: "the apple", example: "Como una manzana." },
      { front: "la pera", back: "the pear" },
      { front: "100%_real", back: "wildcards are literal" },
    ];
    const deck = await post<DeckSummary>("/api/decks", { name: `Fruit ${tag}`, description: "Frutas", reverseCards: true }, 201);
    expect(deck.visibility).toBe("private");
    await post(`/api/decks/${deck.id}/cards/bulk`, { cards: words });
    const [first] = (await api<CardList>(`/api/decks/${deck.id}/cards?q=manzana`)).cards;
    // Over D1's 50-byte LIKE pattern limit.
    expect((await api<CardList>(`/api/decks/${deck.id}/cards?q=${encodeURIComponent("яблоко ".repeat(8))}`)).total).toBe(0);
    await patch(`/api/cards/${first.id}`, { learned: true, flag: 3 });
    const empty = await post<DeckSummary>("/api/decks", { name: `Empty ${tag}`, visibility: "public" }, 201);
    expect(empty.visibility).toBe("public");

    const search = (q: string) => api<PublicDeckList>(`/api/public/decks?q=${encodeURIComponent(q)}`);

    // Private: invisible to everyone else, as if it didn't exist.
    await asNewUser(async () => {
      expect((await search(tag)).total).toBe(0);
      await api(`/api/public/decks/${deck.id}`, {}, 404);
      await api(`/api/public/decks/${deck.id}/cards`, {}, 404);
      await api(`/api/public/decks/${deck.id}/copy`, { method: "POST" }, 404);
      await api(`/api/decks/${deck.id}`, {}, 404);
    });
    // The owner can still open their own private deck through the share route.
    expect(await api<PublicDeck>(`/api/public/decks/${deck.id}`)).toMatchObject({ isOwn: true, visibility: "private" });

    expect(await patch(`/api/decks/${deck.id}`, { visibility: "public" })).toMatchObject({ visibility: "public" });
    await api(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ visibility: "shared" }) }, 400);
    expect((await api<DeckSummary>(`/api/decks/${deck.id}`)).visibility).toBe("public");

    const copied = await asNewUser(async () => {
      // Found by name or description; empty public decks are left out of search but open by link.
      const found = await search(tag);
      expect(found.total).toBe(1);
      expect(found.decks[0]).toEqual({
        id: deck.id,
        name: `Fruit ${tag}`,
        description: "Frutas",
        reverseCards: true,
        visibility: "public",
        total: 3,
        authorName: "Learner",
        isOwn: false,
        updatedAt: expect.any(Number),
      });
      expect((await search("frutas")).decks.some((d) => d.id === deck.id)).toBe(true);
      expect(await api<PublicDeck>(`/api/public/decks/${empty.id}`)).toMatchObject({ total: 0, isOwn: false });
      // LIKE wildcards in the query are literal.
      expect((await search("%")).decks.some((d) => d.id === deck.id)).toBe(false);

      // Text only, in the author's order, without the owner's progress, flags or photos.
      const cards = await api<PublicCardList>(`/api/public/decks/${deck.id}/cards`);
      expect(cards).toEqual({ total: 3, cards: words.map((w) => ({ id: expect.any(String), example: "", ...w })) });
      expect((await api<PublicCardList>(`/api/public/decks/${deck.id}/cards?q=${encodeURIComponent("_r")}`)).total).toBe(1);
      // Long queries (D1 rejects LIKE patterns over 50 bytes), e.g. a pasted share link.
      const link = `http://localhost:5173/shared/${deck.id}`;
      expect((await api<PublicCardList>(`/api/public/decks/${deck.id}/cards?q=${encodeURIComponent(link)}`)).total).toBe(0);
      expect((await search(link)).total).toBe(0);

      // Viewing doesn't allow editing.
      await api(`/api/decks/${deck.id}`, { method: "PATCH", body: JSON.stringify({ name: "Hijacked" }) }, 404);
      await api(`/api/cards/${first.id}`, { method: "PATCH", body: JSON.stringify({ back: "x" }) }, 404);

      // Copying makes a private deck of the user's own, with every word new.
      const copy = await post<DeckSummary>(`/api/public/decks/${deck.id}/copy`, {}, 201);
      expect(copy).toMatchObject({ name: `Fruit ${tag}`, description: "Frutas", reverseCards: true, visibility: "private", total: 3 });
      expect(copy.id).not.toBe(deck.id);
      const mine = await api<DeckSummary>(`/api/decks/${copy.id}`);
      expect(mine).toMatchObject({ total: 3, learnedCount: 0, newCount: 3, visibility: "private" });
      const list = await api<CardList>(`/api/decks/${copy.id}/cards`);
      expect(list.cards.map((c) => c.front)).toEqual(words.map((w) => w.front).reverse());
      expect(list.cards.every((c) => c.flag === 0 && c.learnedAt === null && c.state === State.New)).toBe(true);
      // Both directions came along, as the source deck studies in reverse.
      const queue = await api<StudyQueue>(`/api/study?deckId=${copy.id}`);
      expect(queue.queue).toHaveLength(3);
      expect((await search(tag)).total).toBe(1);
      return copy;
    });
    // The copy belongs to the other user only.
    await api(`/api/decks/${copied.id}`, {}, 404);
    expect((await api<DeckSummary>(`/api/decks/${deck.id}`)).learnedCount).toBe(1);

    // Search lists the owner's own public decks too, flagged as theirs.
    expect((await search(tag)).decks[0].isOwn).toBe(true);

    // Making it private again hides it at once.
    await patch(`/api/decks/${deck.id}`, { visibility: "private" });
    await asNewUser(async () => {
      expect((await search(tag)).total).toBe(0);
      await api(`/api/public/decks/${deck.id}`, {}, 404);
    });

    await post("/api/decks", { name: "Bad", visibility: "shared" }, 400);
    await api(`/api/public/decks?limit=0`, {}, 400);
  });

  it("caps each user's photo storage", () =>
    asNewUser(async () => {
      const deck = await post<DeckSummary>("/api/decks", { name: "Album" }, 201);
      const big = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "grande", back: "big" }, 201);
      const small = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "pequeño", back: "small" }, 201);
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
      const upload = (id: string, expected = 200) =>
        api<CardDto>(`/api/cards/${id}/image`, { method: "PUT", body: png, headers: { "content-type": "image/png" } }, expected);

      const first = await upload(big.id);
      expect(first).not.toHaveProperty("imageBytes");
      expect(await env.DB.prepare("select image_bytes from card where id = ?").bind(big.id).first()).toEqual({ image_bytes: png.length });
      // Pretend that photo filled almost all of the allowance.
      await env.DB.prepare("update card set image_bytes = ? where id = ?").bind(PHOTO_STORAGE_BYTES - 5, big.id).run();

      await upload(small.id, 507);
      // Replacing the big photo is fine: the old one doesn't count against the new one.
      await upload(big.id);
      // Removing it frees the space.
      await api(`/api/cards/${big.id}/image`, { method: "DELETE" });
      await upload(small.id);

      // A reverse card shares its word's photo and size but isn't counted twice.
      await patch(`/api/decks/${deck.id}`, { reverseCards: true });
      const sizes = await env.DB.prepare("select reverse, image_bytes from card where note_id = ? order by reverse").bind(small.id).all();
      expect(sizes.results).toEqual([
        { reverse: 0, image_bytes: png.length },
        { reverse: 1, image_bytes: png.length },
      ]);
      await env.DB.prepare("update card set image_bytes = ? where id = ?").bind(PHOTO_STORAGE_BYTES - png.length, small.id).run();
      await upload(big.id);
    }));

  it("lets users report other people's public decks", async () => {
    const deck = await post<DeckSummary>("/api/decks", { name: "Reported", visibility: "public" }, 201);
    const hidden = await post<DeckSummary>("/api/decks", { name: "Hidden" }, 201);
    const report = (id: string, body: unknown, expected: number) => post(`/api/public/decks/${id}/report`, body, expected);

    await report(deck.id, { reason: "spam" }, 400); // own deck
    await asNewUser(async () => {
      await report(deck.id, { reason: "nonsense" }, 400);
      await report(deck.id, { reason: "spam", details: "x".repeat(1001) }, 400);
      await report(hidden.id, { reason: "spam" }, 404); // private decks answer like missing ones
      await report(deck.id, { reason: "spam", details: "Ads" }, 204);
      // Reporting again updates the same report.
      await report(deck.id, { reason: "illegal", details: "  Not allowed here  " }, 204);
    });
    const { results } = await env.DB.prepare("select reason, details, resolved_at from content_report where deck_id = ?")
      .bind(deck.id)
      .all();
    expect(results).toEqual([{ reason: "illegal", details: "Not allowed here", resolved_at: null }]);

    // Reports go with the deck.
    await api(`/api/decks/${deck.id}`, { method: "DELETE" }, 204);
    const after = await env.DB.prepare("select count(*) as n from content_report where deck_id = ?").bind(deck.id).first();
    expect(after?.n).toBe(0);
  });

  it("exports all of a user's data", () =>
    asNewUser(async () => {
      const deck = await post<DeckSummary>("/api/decks", { name: "Mine" }, 201);
      const card = await post<CardDto>(`/api/decks/${deck.id}/cards`, { front: "el perro", back: "the dog" }, 201);
      await post<ReviewResult>("/api/reviews", { cardId: card.id, rating: Rating.Good, reviewedAt: Date.now() });
      await post("/api/tokens", { name: "Laptop" }, 201);

      const res = await exports.default.fetch(new Request(`${ORIGIN}/api/me/export`, { headers: { cookie } }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="flipword-export-\d{4}-\d{2}-\d{2}\.json"$/);
      const text = await res.text();
      const data = JSON.parse(text);
      expect(data.user).toMatchObject({ name: "U", email: expect.stringMatching(/@example\.com$/) });
      expect(data.settings).toMatchObject({ newPerDay: 20 });
      expect(data.decks).toHaveLength(1);
      expect(data.decks[0]).toMatchObject({ id: deck.id, name: "Mine", cards: [{ id: card.id, front: "el perro" }] });
      expect(data.reviewLog).toHaveLength(1);
      expect(data.apiTokens).toEqual([{ name: "Laptop", prefix: expect.any(String), createdAt: expect.any(Number), lastUsedAt: null }]);
      // Nothing that only matters internally or is a credential.
      expect(text).not.toContain("userId");
      expect(text).not.toContain("tokenHash");
    }));

  it("validates input", async () => {
    await post("/api/decks", { name: "" }, 400);
    await post("/api/reviews", { cardId: "x", rating: 5, reviewedAt: Date.now() }, 400);
  });
});
