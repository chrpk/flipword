import { Ghost, Grid2x2, ListChecks, PencilLine, Shuffle, TextCursorInput, ToggleRight, type LucideIcon } from "lucide-react";
import type { GameId } from "../../../shared/games";

/** Kept apart from the catalog so pages can show game icons without loading the games themselves. */
export const GAME_ICONS: Record<GameId, LucideIcon> = {
  match: Grid2x2,
  quiz: ListChecks,
  truefalse: ToggleRight,
  spell: PencilLine,
  scramble: Shuffle,
  gapline: TextCursorInput,
  showdown: Ghost,
};
