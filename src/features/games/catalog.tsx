import type { ComponentType } from "react";
import { GAME_INFO, type GameId } from "../../../shared/games";
import type { PlayCard } from "../../../shared/types";
import { GapLineGame } from "./GapLineGame";
import { gapRounds, scrambleable } from "./logic";
import { MatchGame } from "./MatchGame";
import { QuizGame } from "./QuizGame";
import { ScrambleGame } from "./ScrambleGame";
import { ShowdownGame } from "./ShowdownGame";
import { SpellGame } from "./SpellGame";
import { TrueFalseGame } from "./TrueFalseGame";
import type { GameProps } from "./types";

export interface GameEntry {
  component: ComponentType<GameProps>;
  /** Cards from the deck that this game can use. */
  usable: (cards: PlayCard[], lang: string) => PlayCard[];
  /** How many cards to request: games that need distractors (or a refilling board) ask for more than they show. */
  fetchCount: number;
}

const all = (cards: PlayCard[]) => cards;

export const GAME_CATALOG: Record<GameId, GameEntry> = {
  match: { component: MatchGame, usable: all, fetchCount: 20 },
  quiz: { component: QuizGame, usable: all, fetchCount: 40 },
  truefalse: { component: TrueFalseGame, usable: all, fetchCount: GAME_INFO.truefalse.cards },
  spell: { component: SpellGame, usable: all, fetchCount: GAME_INFO.spell.cards },
  scramble: { component: ScrambleGame, usable: (cards) => cards.filter(scrambleable), fetchCount: 30 },
  // Words with a sentence come first; the rest of the deal only supplies wrong options.
  gapline: { component: GapLineGame, usable: (cards, lang) => gapRounds(cards, lang).map((r) => r.card), fetchCount: 40 },
  showdown: { component: ShowdownGame, usable: all, fetchCount: 30 },
};
