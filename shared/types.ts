import type { AchievementTrack } from "./achievements";
import type { GameId } from "./games";
import type { SrsFields } from "./srs";

export type SocialProvider = "google" | "facebook";

export interface AppConfig {
  providers: SocialProvider[];
  devLogin: boolean;
  /** Who runs this instance, for the privacy policy and terms; empty strings until configured. */
  operator: { name: string; email: string };
}

export interface Settings {
  nativeLang: string;
  targetLang: string;
  newPerDay: number;
  maxReviewsPerDay: number;
  desiredRetention: number;
  onboarded: boolean;
  /** Custom names for flags 1–5; an empty string means "use the default colour name". */
  flagNames: string[];
  /** IANA time zone last reported by the user's browser. */
  timeZone: string | null;
}

export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  settings: Settings;
}

export type DeckVisibility = "private" | "public";

export interface Deck {
  id: string;
  name: string;
  description: string;
  reverseCards: boolean;
  /** Private decks are only visible to their owner; public ones can be shared, searched and copied. */
  visibility: DeckVisibility;
  createdAt: number;
  updatedAt: number;
}

export interface DeckCounts {
  total: number;
  /** New cards available today (capped by the daily new limit). */
  newCount: number;
  learningCount: number;
  reviewCount: number;
  /** Earliest due time among non-new cards, or null. */
  nextDue: number | null;
  /** Words the user marked as learned. */
  learnedCount: number;
}

export type DeckSummary = Deck & DeckCounts;

export interface CardDto extends SrsFields {
  id: string;
  deckId: string;
  noteId: string;
  /** Shows the back first. */
  reverse: boolean;
  suspended: boolean;
  /** Set when the user marked the word as learned. */
  learnedAt: number | null;
  /** Photo for the word's meaning; served from /api/images/<key>. */
  imageKey: string | null;
  /** Colour flag 1–5, 0 for none. */
  flag: number;
  front: string;
  back: string;
  example: string;
  createdAt: number;
  updatedAt: number;
}

/** How often a word was answered right and wrong, in study sessions and games. */
export interface AnswerCounts {
  correctCount: number;
  wrongCount: number;
}

export type CardListItem = CardDto & AnswerCounts;

export interface CardList {
  cards: CardListItem[];
  total: number;
}

export interface CardProgress {
  reviews: { correct: number; wrong: number };
  games: { correct: number; wrong: number };
  /** Most recent answers first. `source` is "review" or the game that produced it. */
  recent: { at: number; correct: boolean; source: "review" | GameId }[];
}

export interface GameBest {
  game: GameId;
  /** Best score (or fastest time for timed games), null if never finished. */
  best: number | null;
  plays: number;
}

export interface PracticeResult {
  best: number;
  isBest: boolean;
}

export type CardFilter = "all" | "new" | "learning" | "review" | "due" | "learned" | "suspended";

export interface StudyQueue {
  /** Learning cards (state 1/3) due within the learn-ahead window, sorted by due. */
  learning: CardDto[];
  /** Due reviews followed by new cards. */
  queue: CardDto[];
  desiredRetention: number;
}

export interface ReviewResult {
  card: CardDto;
  logId: string;
  /** The card lapsed too often and its word was suspended. */
  leech: boolean;
}

export interface Stats {
  today: { reviews: number; durationMs: number };
  streak: number;
  retention: number | null;
  totalReviews: number;
  /** Last 30 days, oldest first. `day` is YYYY-MM-DD in the client's timezone. */
  daily: { day: string; reviews: number; again: number }[];
  /** Next 14 days, today first. Overdue cards count towards today. */
  forecast: { day: string; due: number }[];
  states: { new: number; learning: number; review: number; relearning: number };
  /** Words marked as learned (not counted in `states`). */
  learned: number;
}

export interface AchievementTrackProgress {
  track: AchievementTrack;
  /** Best value so far: the longest streak, or the current total for the other tracks. */
  value: number;
  /** Every tier on the track, lowest goal first. */
  tiers: { id: string; goal: number; unlockedAt: number | null }[];
}

export interface Achievements {
  tracks: AchievementTrackProgress[];
  /** Consecutive days with a review, up to today (or yesterday when today has none yet). */
  currentStreak: number;
  /** Whether today already counts towards the streak. */
  studiedToday: boolean;
  /** Unlocked achievements the user hasn't been told about yet, oldest first. */
  unseen: string[];
}

export interface ApiTokenInfo {
  id: string;
  name: string;
  /** First characters of the token, e.g. "fw_Ab3d". */
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** Returned once, when a token is created. */
export interface CreatedToken extends ApiTokenInfo {
  token: string;
}

/** A deck as other users see it: no study progress, and the author only by first name. */
export interface PublicDeck {
  id: string;
  name: string;
  description: string;
  reverseCards: boolean;
  visibility: DeckVisibility;
  /** Words in the deck (a reversed word counts once). */
  total: number;
  authorName: string;
  /** The deck belongs to the signed-in user. */
  isOwn: boolean;
  updatedAt: number;
}

export interface PublicDeckList {
  decks: PublicDeck[];
  total: number;
}

/** A word in a public deck: text only. Photos, flags and progress stay private to the owner. */
export interface PublicCard {
  id: string;
  front: string;
  back: string;
  example: string;
}

export interface PublicCardList {
  cards: PublicCard[];
  total: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
}
