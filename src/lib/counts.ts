import type { DeckCounts } from "../../shared/types";

/** Cards left to study today: new, learning and review together. */
export function dueTotal(counts: Pick<DeckCounts, "newCount" | "learningCount" | "reviewCount">) {
  return counts.newCount + counts.learningCount + counts.reviewCount;
}
