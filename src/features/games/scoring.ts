import { HINT_COST, NEAR_MISS_COST, WORD_POINTS } from "../../../shared/games";

/** Points for a typed word: 10, less for each hint and for an "almost"; at least 1 when right. */
export function typedPoints({ correct, hints, nearMiss }: { correct: boolean; hints: number; nearMiss: boolean }, full = WORD_POINTS) {
  if (!correct) return 0;
  return Math.max(1, full - hints * HINT_COST - (nearMiss ? NEAR_MISS_COST : 0));
}

/** Points for a word rebuilt from tiles: 10, less 3 per hint. */
export function tilePoints(solved: boolean, hints: number) {
  return solved ? Math.max(0, WORD_POINTS - hints * HINT_COST) : 0;
}
