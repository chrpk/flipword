import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./api";

/** Where a shared deck can be opened by other signed-in users. */
export function shareUrl(deckId: string) {
  return `${window.location.origin}/shared/${deckId}`;
}

/** Refreshes everything that shows a deck after its visibility or content changed. */
export function invalidateDeck(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.public });
}
