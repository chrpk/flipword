import { and, eq, gte, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { DEFAULT_RETENTION, LEARN_AHEAD_MS, newSrsFields, Rating, State } from "../shared/srs";
import type { CardDto, DeckCounts, Settings } from "../shared/types";
import { DAY_MS, type Clock, type Db } from "./context";
import { card, practiceLog, reviewLog, userSettings } from "./db/schema";

/**
 * Case-insensitive (ASCII, like LIKE) substring match. Not LIKE: D1 rejects LIKE patterns over 50 bytes,
 * which a pasted link or a few words of non-Latin text already exceed.
 */
export const contains = (col: SQLWrapper, q: string) => sql`instr(lower(${col}), lower(${q})) > 0`;

export const DEFAULT_SETTINGS: Settings = {
  nativeLang: "en",
  targetLang: "es",
  newPerDay: 20,
  maxReviewsPerDay: 200,
  desiredRetention: DEFAULT_RETENTION,
  onboarded: false,
  flagNames: ["", "", "", "", ""],
  timeZone: null,
};

function parseFlagNames(json: string): string[] {
  try {
    const names = JSON.parse(json) as unknown;
    if (Array.isArray(names)) return [0, 1, 2, 3, 4].map((i) => (typeof names[i] === "string" ? names[i] : ""));
  } catch {
    // fall through to defaults
  }
  return DEFAULT_SETTINGS.flagNames;
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (!row) return DEFAULT_SETTINGS;
  const { userId: _, updatedAt: __, flagNames, ...settings } = row;
  return { ...settings, flagNames: parseFlagNames(flagNames) };
}

/** Day index (as Clock#dayIndex) of an epoch-milliseconds column, in the client's timezone. */
export function dayIndexSql(clock: Clock, col: SQLWrapper) {
  return sql<number>`cast((${col} - ${clock.tzOffset * 60_000}) / ${DAY_MS} as integer)`;
}

/** New cards introduced and reviews done since the start of today. */
export async function todayProgress(db: Db, userId: string, clock: Clock) {
  const [row] = await db
    .select({
      newDone: sql<number>`count(distinct case when ${reviewLog.state} = ${State.New} then ${reviewLog.cardId} end)`,
      reviewsDone: sql<number>`coalesce(sum(${reviewLog.state} = ${State.Review}), 0)`,
    })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), gte(reviewLog.review, clock.dayStart())));
  return { newDone: row?.newDone ?? 0, reviewsDone: row?.reviewsDone ?? 0 };
}

/** Settings and today's progress (two independent queries, run together) → what's left of today's limits. */
export async function remainingToday(db: Db, userId: string, clock: Clock) {
  const [settings, done] = await Promise.all([getSettings(db, userId), todayProgress(db, userId, clock)]);
  return {
    settings,
    newLeft: Math.max(0, settings.newPerDay - done.newDone),
    reviewsLeft: Math.max(0, settings.maxReviewsPerDay - done.reviewsDone),
  };
}

/**
 * Which cards today's study session offers, as SQL conditions on the outer `card` row. Shared by the study queue
 * and the deck counts so the numbers on a deck always match what a session shows.
 *
 * Words with two directions follow Anki's sibling burying: while one direction is being learned, was studied today,
 * or is due for review, the other waits; and of two eligible directions only one is offered (forward first for new
 * words, the earlier-due one for reviews). Doing this in SQL means LIMITs count words, not cards.
 */
export function studyRules(clock: Clock) {
  const dayEnd = clock.dayEnd();
  const active = sql`(${card.suspended} = 0 and ${card.learnedAt} is null)`;
  // The other direction of the same word. Suspension and learned status are per word, so it shares them.
  const sibling = (cond: SQL) =>
    sql`exists (select 1 from ${card} as s where s.note_id = ${card.noteId} and s.id != ${card.id} and ${cond})`;
  const siblingStudiedToday = sql`exists (
    select 1 from ${reviewLog} join ${card} as s on s.id = ${reviewLog.cardId}
    where s.note_id = ${card.noteId} and s.id != ${card.id} and ${reviewLog.review} >= ${clock.dayStart()})`;
  const siblingLearning = sibling(sql`s.state in (${State.Learning}, ${State.Relearning})`);
  const siblingReviewDue = sibling(sql`s.state = ${State.Review} and s.due < ${dayEnd}`);

  const learning = sql`(${active} and ${card.state} in (${State.Learning}, ${State.Relearning})
    and ${card.due} <= ${clock.now + LEARN_AHEAD_MS})`;
  const review = sql`(${active} and ${card.state} = ${State.Review} and ${card.due} < ${dayEnd}
    and not ${siblingStudiedToday} and not ${siblingLearning}
    and not ${sibling(sql`s.state = ${State.Review} and s.due < ${dayEnd}
      and (s.due < ${card.due} or (s.due = ${card.due} and s.reverse < ${card.reverse}))`)})`;
  const fresh = sql`(${active} and ${card.state} = ${State.New}
    and not ${siblingStudiedToday} and not ${siblingLearning} and not ${siblingReviewDue}
    and not ${sibling(sql`s.state = ${State.New} and s.reverse < ${card.reverse}`)})`;
  return { active, learning, review, fresh };
}

/** Per-deck card counts for the user, keyed by deck id. */
export async function deckCounts(db: Db, userId: string, clock: Clock, deckId?: string) {
  const rules = studyRules(clock);
  // Limits and the per-deck aggregate don't depend on each other: one round trip.
  const [{ newLeft, reviewsLeft }, rows] = await Promise.all([
    remainingToday(db, userId, clock),
    db
      .select({
        deckId: card.deckId,
        // Words, not study cards: a reversed word has two cards but counts once.
        total: sql<number>`coalesce(sum(${card.reverse} = 0), 0)`,
        newCount: sql<number>`coalesce(sum(${rules.fresh}), 0)`,
        learningCount: sql<number>`coalesce(sum(${rules.learning}), 0)`,
        reviewCount: sql<number>`coalesce(sum(${rules.review}), 0)`,
        nextDue: sql<number | null>`min(case when ${rules.active} and ${card.state} != ${State.New} then ${card.due} end)`,
        learnedCount: sql<number>`coalesce(sum(${card.reverse} = 0 and ${card.learnedAt} is not null), 0)`,
      })
      .from(card)
      .where(deckId ? and(eq(card.userId, userId), eq(card.deckId, deckId)) : eq(card.userId, userId))
      .groupBy(card.deckId),
  ]);

  const counts = new Map<string, DeckCounts>();
  for (const r of rows) {
    counts.set(r.deckId, {
      total: r.total,
      newCount: Math.min(r.newCount, newLeft),
      learningCount: r.learningCount,
      reviewCount: Math.min(r.reviewCount, reviewsLeft),
      nextDue: r.nextDue,
      learnedCount: r.learnedCount,
    });
  }
  return counts;
}

export const EMPTY_COUNTS: DeckCounts = {
  total: 0,
  newCount: 0,
  learningCount: 0,
  reviewCount: 0,
  nextDue: null,
  learnedCount: 0,
};

type CardRow = typeof card.$inferInsert;

/** Card rows for a new word: the forward card, plus a reverse card when the deck studies both ways. */
export function newCardRows(
  target: { id: string; reverseCards: boolean },
  userId: string,
  text: { front: string; back: string; example: string },
  now: number,
  order = 0,
): CardRow[] {
  const noteId = crypto.randomUUID();
  const base = { deckId: target.id, userId, noteId, ...text, ...newSrsFields(now + order), createdAt: now + order, updatedAt: now };
  const rows: CardRow[] = [{ ...base, id: noteId, reverse: false }];
  if (target.reverseCards) rows.push({ ...base, id: crypto.randomUUID(), reverse: true });
  return rows;
}

/** Upper bound for one json_each parameter; D1 allows 2 MB per value. */
const MAX_JSON_PARAM_BYTES = 900_000;

/**
 * INSERT statements for many card rows: each statement binds one JSON array and expands it with json_each, so a
 * 1,000-row import is one or two statements instead of hundreds (D1 caps parameters per statement and queries per
 * invocation). Columns not listed keep their defaults (new-card scheduling, not suspended, no flag/photo).
 */
export function insertCardStatements(d1: D1Database, rows: CardRow[]): D1PreparedStatement[] {
  const insert = `insert into card (id, deck_id, user_id, note_id, reverse, front, back, example, due, created_at, updated_at)
    select json_extract(value, '$.id'), json_extract(value, '$.d'), json_extract(value, '$.u'), json_extract(value, '$.n'),
      json_extract(value, '$.r'), json_extract(value, '$.f'), json_extract(value, '$.b'), json_extract(value, '$.e'),
      json_extract(value, '$.t'), json_extract(value, '$.t'), json_extract(value, '$.m')
    from json_each(?1)`;
  const statements: D1PreparedStatement[] = [];
  let chunk: string[] = [];
  let bytes = 2;
  const flush = () => {
    if (chunk.length) statements.push(d1.prepare(insert).bind(`[${chunk.join(",")}]`));
    chunk = [];
    bytes = 2;
  };
  for (const r of rows) {
    const json = JSON.stringify({
      id: r.id,
      d: r.deckId,
      u: r.userId,
      n: r.noteId,
      r: r.reverse ? 1 : 0,
      f: r.front,
      b: r.back,
      e: r.example ?? "",
      t: r.createdAt,
      m: r.updatedAt,
    });
    const size = new TextEncoder().encode(json).length + 1;
    if (bytes + size > MAX_JSON_PARAM_BYTES) flush();
    chunk.push(json);
    bytes += size;
  }
  flush();
  return statements;
}

/** Adds missing reverse cards (or removes them) so a deck's cards match its reverse setting. */
export async function syncReverseCards(db: Db, deckId: string, reverseCards: boolean, now: number) {
  if (!reverseCards) {
    await db.delete(card).where(and(eq(card.deckId, deckId), eq(card.reverse, true)));
    return;
  }
  await db.run(sql`
    insert into ${card} (id, deck_id, user_id, note_id, reverse, suspended, learned_at, image_key, image_bytes, flag, front, back, example, due, created_at, updated_at)
    select lower(hex(randomblob(16))), deck_id, user_id, note_id, 1, suspended, learned_at, image_key, image_bytes, flag, front, back, example, ${now}, created_at, ${now}
    from ${card} as f
    where f.deck_id = ${deckId} and f.reverse = 0
      and not exists (select 1 from ${card} as r where r.note_id = f.note_id and r.reverse = 1)`);
}

/** Right/wrong answer counts for a word across both directions, from study reviews and games. */
export function answerCountColumns() {
  const reviews = (cond: SQL) => sql`(select count(*) from ${reviewLog} join ${card} as s on s.id = ${reviewLog.cardId}
    where s.note_id = ${card.noteId} and ${cond})`;
  const games = (correct: boolean) => sql`(select count(*) from ${practiceLog} join ${card} as s on s.id = ${practiceLog.cardId}
    where s.note_id = ${card.noteId} and ${practiceLog.correct} = ${correct ? 1 : 0})`;
  return {
    correctCount: sql<number>`${reviews(sql`${reviewLog.rating} > ${Rating.Again}`)} + ${games(true)}`,
    wrongCount: sql<number>`${reviews(sql`${reviewLog.rating} = ${Rating.Again}`)} + ${games(false)}`,
  };
}

export function toCardDto(row: typeof card.$inferSelect): CardDto {
  const { userId: _, imageBytes: __, ...dto } = row;
  return dto;
}
