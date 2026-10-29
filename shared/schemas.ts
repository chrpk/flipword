import { z } from "zod";
import { FLAG_NAME_MAX } from "./flags";
import { GAMES } from "./games";
import { isValidTimeZone } from "./time";

// Zod otherwise probes for eval support with `Function("")`, which the app's Content-Security-Policy blocks (and
// reports) in the browser. Workers already run it this way.
z.config({ jitless: true });

export const LIMITS = {
  deckName: 100,
  deckDescription: 500,
  cardField: 2000,
  bulkCards: 500,
} as const;

const deckName = z.string().trim().min(1).max(LIMITS.deckName);
const deckDescription = z.string().trim().max(LIMITS.deckDescription);
export const DECK_VISIBILITIES = ["private", "public"] as const;
const deckVisibility = z.enum(DECK_VISIBILITIES);

export const deckInput = z.object({
  name: deckName,
  description: deckDescription.default(""),
  reverseCards: z.boolean().default(false),
  /** New decks are private unless the user chooses otherwise. */
  visibility: deckVisibility.default("private"),
});

// Patch schemas must not carry defaults: zod applies them to omitted keys even under .partial().
export const deckPatch = z
  .object({ name: deckName, description: deckDescription, reverseCards: z.boolean(), visibility: deckVisibility })
  .partial();

export const publicDeckQuery = z.object({
  q: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const REPORT_REASONS = ["spam", "offensive", "illegal", "copyright", "other"] as const;

export const reportInput = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});

export const publicCardQuery = z.object({
  q: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const cardText = z.string().trim().min(1).max(LIMITS.cardField);
const cardExample = z.string().trim().max(LIMITS.cardField);

export const cardInput = z.object({
  front: cardText,
  back: cardText,
  example: cardExample.default(""),
});

export const cardPatch = z
  .object({
    front: cardText,
    back: cardText,
    example: cardExample,
    deckId: z.string().min(1),
    suspended: z.boolean(),
    learned: z.boolean(),
    flag: z.number().int().min(0).max(5),
  })
  .partial();

export const bulkCardsInput = z.object({
  cards: z.array(cardInput).min(1).max(LIMITS.bulkCards),
  skipDuplicates: z.boolean().default(true),
});

export const cardListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(["all", "new", "learning", "review", "due", "learned", "suspended"]).default("all"),
  flag: z.coerce.number().int().min(1).max(5).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const reviewInput = z.object({
  cardId: z.string().min(1),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  /** Instant the answer was revealed; used so server scheduling matches the preview. */
  reviewedAt: z.number().int().positive(),
  /** Client time when the request was sent, used to detect a wrong client clock. */
  sentAt: z.number().int().positive().optional(),
  durationMs: z.number().int().min(0).max(60 * 60 * 1000).default(0),
});

export const undoInput = z.object({ logId: z.string().min(1) });

export const achievementsSeenInput = z.object({ ids: z.array(z.string().min(1).max(64)).max(100) });

export const settingsPatch = z
  .object({
    nativeLang: z.string().min(2).max(16),
    targetLang: z.string().min(2).max(16),
    newPerDay: z.number().int().min(0).max(9999),
    maxReviewsPerDay: z.number().int().min(0).max(9999),
    desiredRetention: z.number().min(0.7).max(0.99),
    onboarded: z.boolean(),
    flagNames: z.array(z.string().trim().max(FLAG_NAME_MAX)).length(5),
    timeZone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
  })
  .partial();

export const practiceInput = z.object({
  deckId: z.string().min(1),
  game: z.enum(GAMES),
  /** Points, or milliseconds for timed games where lower is better. */
  score: z.number().int().min(0).max(10_000_000),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  answers: z.array(z.object({ cardId: z.string().min(1), correct: z.boolean() })).max(500),
});

export const tokenInput = z.object({ name: z.string().trim().min(1).max(60) });

export const playQuery = z.object({ count: z.coerce.number().int().min(1).max(100).default(10) });
