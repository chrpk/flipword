import type { AnswerFormat, GameMode } from "../../../shared/games";
import type { PlayCard } from "../../../shared/types";

export interface GameAnswer {
  cardId: string;
  correct: boolean;
  format: AnswerFormat;
  /** Hints used before answering. */
  hints?: number;
  /** 1 for the first try at a word, 2+ when a missed word came back. */
  attempt?: number;
  latencyMs?: number;
  /** Accepted as "almost": a slipped accent, or the dictionary form where the sentence needs another. */
  nearMiss?: boolean;
  /** For a wrong pick: the card whose text was picked. */
  confusedWith?: string;
}

export interface GameOutcome {
  /** Points, or milliseconds for standard Match, where lower is better. */
  score: number;
  durationMs: number;
  answers: GameAnswer[];
  /** Showdown: whether the boss was beaten. */
  won?: boolean;
}

export interface GameProps {
  /** The words to play, already filtered to what the game can use. */
  cards: PlayCard[];
  /** Every card dealt, for wrong options (Gap Line plays only cards with a sentence, but picks from all). */
  pool: PlayCard[];
  /** BCP 47 tags for the word side and the meaning side. */
  langs: { word: string; meaning: string };
  mode: GameMode;
  /** Accept a slipped accent as "almost". */
  lenientAccents: boolean;
  /** Special letters for the accent strip under typed answers. */
  accents: string[];
  /** Read sentences and answers aloud. */
  sound: boolean;
  onFinish: (outcome: GameOutcome) => void;
}
