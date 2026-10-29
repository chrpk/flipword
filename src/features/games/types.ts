import type { CardDto } from "../../../shared/types";

export interface GameAnswer {
  cardId: string;
  correct: boolean;
}

export interface GameOutcome {
  /** Points, or milliseconds for games where lower is better. */
  score: number;
  durationMs: number;
  answers: GameAnswer[];
}

export interface GameProps {
  cards: CardDto[];
  /** BCP 47 tags for the word side and the meaning side. */
  langs: { word: string; meaning: string };
  onFinish: (outcome: GameOutcome) => void;
}
