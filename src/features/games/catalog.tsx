import type { ComponentType } from "react";
import { GAME_INFO, type GameId } from "../../../shared/games";
import type { CardDto } from "../../../shared/types";
import { scrambleable } from "./logic";
import { MatchGame } from "./MatchGame";
import { QuizGame } from "./QuizGame";
import { ScrambleGame } from "./ScrambleGame";
import { SpellGame } from "./SpellGame";
import { TrueFalseGame } from "./TrueFalseGame";
import type { GameProps } from "./types";

export interface GameEntry {
  component: ComponentType<GameProps>;
  /** Cards from the deck that this game can use. */
  usable: (cards: CardDto[]) => CardDto[];
  /** How many cards to request: games that need distractors ask for more than they show. */
  fetchCount: number;
}

const all = (cards: CardDto[]) => cards;

export const GAME_CATALOG: Record<GameId, GameEntry> = {
  match: { component: MatchGame, usable: all, fetchCount: 20 },
  quiz: { component: QuizGame, usable: all, fetchCount: 40 },
  truefalse: { component: TrueFalseGame, usable: all, fetchCount: GAME_INFO.truefalse.cards },
  spell: { component: SpellGame, usable: all, fetchCount: GAME_INFO.spell.cards },
  scramble: { component: ScrambleGame, usable: (cards) => cards.filter(scrambleable), fetchCount: 30 },
};
