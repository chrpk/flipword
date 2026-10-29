export const GAMES = ["match", "quiz", "truefalse", "spell", "scramble"] as const;

export type GameId = (typeof GAMES)[number];

export interface GameInfo {
  /** Recognition games show the answer among options; recall games make you produce it. */
  kind: "recognition" | "recall";
  /** Fewest cards a deck needs for the game to make sense. */
  minCards: number;
  /** Cards drawn per game. */
  cards: number;
  /** Match is scored by time; the others by points. */
  lowerIsBetter: boolean;
}

export const GAME_INFO: Record<GameId, GameInfo> = {
  match: { kind: "recognition", minCards: 3, cards: 6, lowerIsBetter: true },
  quiz: { kind: "recognition", minCards: 4, cards: 10, lowerIsBetter: false },
  truefalse: { kind: "recognition", minCards: 2, cards: 60, lowerIsBetter: false },
  spell: { kind: "recall", minCards: 1, cards: 10, lowerIsBetter: false },
  scramble: { kind: "recall", minCards: 1, cards: 10, lowerIsBetter: false },
};

/** Match adds this much to the clock for every wrong pair. */
export const MATCH_PENALTY_MS = 1000;
/** Points an Unscramble hint costs (a solved word is worth 10). */
export const SCRAMBLE_HINT_COST = 3;
/** Length of a true-or-false round. */
export const TRUE_FALSE_MS = 60_000;
