import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// Better Auth core tables. Property names must match Better Auth's field names.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's rate-limit counters (`rateLimit.storage: "database"`): memory isn't shared between Worker isolates. */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

// App tables. Timestamps are epoch milliseconds stored as plain integers.

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  nativeLang: text("native_lang").notNull().default("en"),
  targetLang: text("target_lang").notNull().default("es"),
  newPerDay: integer("new_per_day").notNull().default(20),
  maxReviewsPerDay: integer("max_reviews_per_day").notNull().default(200),
  desiredRetention: real("desired_retention").notNull().default(0.9),
  onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
  /** JSON array of the user's names for flags 1–5; empty strings use the default colour names. */
  flagNames: text("flag_names").notNull().default("[]"),
  /** IANA time zone reported by the user's browser; used for day boundaries when a request doesn't send one. */
  timeZone: text("time_zone"),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const deck = sqliteTable(
  "deck",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Also study every card from back to front (Anki's "Basic (and reversed card)"). */
    reverseCards: integer("reverse_cards", { mode: "boolean" }).notNull().default(false),
    /** "private": only the owner sees it. "public": any signed-in user can find, view and copy it. */
    visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("private"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("deck_user_idx").on(t.userId), index("deck_visibility_idx").on(t.visibility, t.updatedAt)],
);

export const card = sqliteTable(
  "card",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Groups a word's forward and reverse cards; equals the forward card's id. */
    noteId: text("note_id").notNull(),
    /** 0 = show front first, 1 = show back first. */
    reverse: integer("reverse", { mode: "boolean" }).notNull().default(false),
    /** Excluded from study, manually or after becoming a leech. */
    suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
    /** When the user marked the word as learned; learned words leave daily study but keep their schedule. */
    learnedAt: integer("learned_at"),
    /** R2 key of the word's photo, shared by both directions. */
    imageKey: text("image_key"),
    /** Size of that photo, for the per-user storage limit (counted once per word, on the forward card). */
    imageBytes: integer("image_bytes"),
    /** Colour flag 1–5, 0 for none. */
    flag: integer("flag").notNull().default(0),
    front: text("front").notNull(),
    back: text("back").notNull(),
    example: text("example").notNull().default(""),
    // FSRS state (mirrors ts-fsrs Card)
    due: integer("due").notNull(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0),
    lastReview: integer("last_review"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("card_user_due_idx").on(t.userId, t.state, t.due),
    index("card_deck_idx").on(t.deckId, t.createdAt),
    uniqueIndex("card_note_direction_idx").on(t.noteId, t.reverse),
  ],
);

export const reviewLog = sqliteTable(
  "review_log",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => card.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    // Card state *before* this review, as recorded by ts-fsrs ReviewLog
    state: integer("state").notNull(),
    due: integer("due").notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    review: integer("review").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [
    index("review_log_user_review_idx").on(t.userId, t.review),
    index("review_log_card_idx").on(t.cardId, t.review),
  ],
);

/** One answer given in a game (games don't affect scheduling, but they count towards a card's progress). */
export const practiceLog = sqliteTable(
  "practice_log",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => card.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("practice_log_card_idx").on(t.cardId, t.createdAt), index("practice_log_user_idx").on(t.userId, t.createdAt)],
);

/** A finished game, for best scores. */
export const gameSession = sqliteTable(
  "game_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    score: integer("score").notNull(),
    correct: integer("correct").notNull(),
    wrong: integer("wrong").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("game_session_deck_idx").on(t.deckId, t.game)],
);

/** An unlocked achievement (see shared/achievements.ts). Kept once earned. */
export const achievement = sqliteTable(
  "achievement",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e.g. "streak-7" */
    id: text("id").notNull(),
    unlockedAt: integer("unlocked_at").notNull(),
    /** When the app told the user about it; null until then. */
    seenAt: integer("seen_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

/** Personal access tokens for MCP clients and scripts. Only a SHA-256 hash of each token is stored. */
export const apiToken = sqliteTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters of the token, shown so users can tell tokens apart. */
    prefix: text("prefix").notNull(),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);

/** A user's report of a public deck (notice and action). Reviewed by hand; see "Moderation" in the README. */
export const contentReport = sqliteTable(
  "content_report",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: ["spam", "offensive", "illegal", "copyright", "other"] }).notNull(),
    details: text("details").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    /** Set by a moderator once the report was handled. */
    resolvedAt: integer("resolved_at"),
  },
  // One open report per user and deck: reporting again updates it instead of piling up rows.
  (t) => [
    uniqueIndex("content_report_deck_reporter_idx").on(t.deckId, t.reporterId),
    index("content_report_open_idx").on(t.resolvedAt, t.createdAt),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  userSettings,
  deck,
  card,
  reviewLog,
  practiceLog,
  gameSession,
  achievement,
  apiToken,
  contentReport,
};
