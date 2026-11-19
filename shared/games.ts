export const GAMES = ["match", "quiz", "truefalse", "spell", "scramble", "gapline", "showdown"] as const;

export type GameId = (typeof GAMES)[number];

/**
 * Recognition games show the answer among options; scaffolded games hand over the letters; recall games make you
 * produce the word yourself.
 */
export type GameKind = "recognition" | "scaffolded" | "recall";

export const GAME_KINDS = ["recognition", "scaffolded", "recall"] as const satisfies readonly GameKind[];

/**
 * Which cards a game asks the server for first:
 * - "intro": due and recently missed words first, new words welcome (guess-first introduction).
 * - "practice": due and recently missed words first, brand-new words last (recall needs some exposure first).
 * - "known": words the learner already knows, so speed builds fluency instead of disrupting learning.
 * - "weak": recently missed, often-forgotten and unstable words first.
 */
export const CARD_POOLS = ["intro", "practice", "known", "weak"] as const;
export type CardPool = (typeof CARD_POOLS)[number];

/** Card data a game can ask the server to put first, so a large deck doesn't starve it. */
export const CARD_NEEDS = ["example"] as const;
export type CardNeed = (typeof CARD_NEEDS)[number];

/**
 * - "standard": the normal game.
 * - "relaxed": no clock, for timed games; scored on accuracy, with its own best.
 * - "retry": a replay of the words missed in the last game; never sets a best.
 */
export const GAME_MODES = ["standard", "relaxed", "retry"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** How an answer was given, from easiest to hardest to fake. Only "typed" answers can count as reviews. */
export const ANSWER_FORMATS = ["verify", "pair", "choice", "tiles", "typed"] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

export interface GameInfo {
  kind: GameKind;
  /** Fewest usable cards a deck needs for the game to make sense. */
  minCards: number;
  /** Cards (or rounds) per game. */
  cards: number;
  /** Has a clock in standard mode, and therefore a relaxed mode too. */
  timed: boolean;
  pool: CardPool;
  needs?: CardNeed;
  /** Answer formats the game produces; the server rejects others. */
  formats: readonly AnswerFormat[];
}

export const GAME_INFO: Record<GameId, GameInfo> = {
  match: { kind: "recognition", minCards: 3, cards: 8, timed: true, pool: "known", formats: ["pair"] },
  quiz: { kind: "recognition", minCards: 4, cards: 10, timed: false, pool: "intro", formats: ["choice"] },
  truefalse: { kind: "recognition", minCards: 2, cards: 60, timed: true, pool: "known", formats: ["verify"] },
  spell: { kind: "recall", minCards: 1, cards: 10, timed: false, pool: "practice", formats: ["typed"] },
  scramble: { kind: "scaffolded", minCards: 1, cards: 10, timed: false, pool: "practice", formats: ["tiles"] },
  gapline: { kind: "recall", minCards: 1, cards: 10, timed: false, pool: "practice", needs: "example", formats: ["choice", "typed"] },
  // Six words, each fought in three phases (pick, tiles, typed).
  showdown: { kind: "recall", minCards: 4, cards: 6, timed: false, pool: "weak", formats: ["choice", "tiles", "typed"] },
};

/** Standard Match is scored by time (lower is better); every other game and mode by points. */
export function scoreIsTime(game: GameId, mode: GameMode) {
  return game === "match" && mode !== "relaxed";
}

/** Match adds this much to the clock for every wrong pair. */
export const MATCH_PENALTY_MS = 1000;
/** Pairs on the Match board at once; matched pairs are replaced from the queue. */
export const MATCH_BOARD_PAIRS = 4;
/** Points a hint costs in games that score 10 per word. */
export const HINT_COST = 3;
/** Points an "almost" answer (a slipped accent, or the dictionary form where the sentence needs another) costs. */
export const NEAR_MISS_COST = 2;
/** Points for a word answered right without help. */
export const WORD_POINTS = 10;
/** Gap Line pays less for a multiple-choice pick than for a typed answer. */
export const GAPLINE_CHOICE_POINTS = 5;
/** Length of a true-or-false round. */
export const TRUE_FALSE_MS = 60_000;
/** Statements in a relaxed (untimed) true-or-false round. */
export const TRUE_FALSE_RELAXED_STATEMENTS = 30;
/** Hearts the player starts a Showdown with. */
export const SHOWDOWN_HEARTS = 5;
/** Bonus points per heart left after winning a Showdown. */
export const SHOWDOWN_HEART_BONUS = 10;
/** A missed word comes back this many items later in the same round. */
export const REQUEUE_GAP = 2;
