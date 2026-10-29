import type { z } from "zod";
import type {
  cardInput,
  cardPatch,
  deckInput,
  practiceInput,
  reportInput,
  reviewInput,
  settingsPatch,
} from "../../shared/schemas";
import type {
  Achievements,
  ApiTokenInfo,
  AppConfig,
  CardDto,
  CardFilter,
  CardList,
  CardProgress,
  CreatedToken,
  DeckSummary,
  GameBest,
  ImportResult,
  Me,
  PracticeResult,
  PublicCardList,
  PublicDeck,
  PublicDeckList,
  ReviewResult,
  Settings,
  Stats,
  StudyQueue,
} from "../../shared/types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("x-tz-offset", String(new Date().getTimezoneOffset()));
  if (json !== undefined) headers.set("content-type", "application/json");

  const res = await fetch(`/api${path}`, {
    ...rest,
    headers,
    credentials: "same-origin",
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type In<S extends z.ZodType> = z.input<S>;

/** Query string from the params that are set. */
function searchParams(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
  return search;
}

export const api = {
  config: () => request<AppConfig>("/config"),
  /** The signed-in user, or null when signed out. */
  me: () => request<Me | null>("/session"),
  dataExportUrl: "/api/me/export",
  updateSettings: (patch: In<typeof settingsPatch>) => request<Settings>("/settings", { method: "PATCH", json: patch }),

  decks: () => request<DeckSummary[]>("/decks"),
  deck: (id: string) => request<DeckSummary>(`/decks/${id}`),
  createDeck: (input: In<typeof deckInput>) => request<DeckSummary>("/decks", { method: "POST", json: input }),
  updateDeck: (id: string, input: Partial<In<typeof deckInput>>) =>
    request<DeckSummary>(`/decks/${id}`, { method: "PATCH", json: input }),
  deleteDeck: (id: string) => request<void>(`/decks/${id}`, { method: "DELETE" }),
  exportUrl: (id: string) => `/api/decks/${id}/export`,

  publicDecks: (params: { q?: string; offset?: number; limit?: number }) =>
    request<PublicDeckList>(`/public/decks?${searchParams(params)}`),
  publicDeck: (id: string) => request<PublicDeck>(`/public/decks/${id}`),
  publicCards: (id: string, params: { q?: string; offset?: number; limit?: number }) =>
    request<PublicCardList>(`/public/decks/${id}/cards?${searchParams(params)}`),
  copyPublicDeck: (id: string) => request<DeckSummary>(`/public/decks/${id}/copy`, { method: "POST" }),
  reportDeck: (id: string, input: In<typeof reportInput>) =>
    request<void>(`/public/decks/${id}/report`, { method: "POST", json: input }),

  cards: (deckId: string, params: { q?: string; filter?: CardFilter; flag?: number; offset?: number; limit?: number }) =>
    request<CardList>(`/decks/${deckId}/cards?${searchParams(params)}`),
  createCard: (deckId: string, input: In<typeof cardInput>) =>
    request<CardDto>(`/decks/${deckId}/cards`, { method: "POST", json: input }),
  importCards: (deckId: string, cards: In<typeof cardInput>[], skipDuplicates: boolean) =>
    request<ImportResult>(`/decks/${deckId}/cards/bulk`, { method: "POST", json: { cards, skipDuplicates } }),
  updateCard: (id: string, patch: In<typeof cardPatch>) => request<CardDto>(`/cards/${id}`, { method: "PATCH", json: patch }),
  deleteCard: (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" }),
  resetCard: (id: string) => request<CardDto>(`/cards/${id}/reset`, { method: "POST" }),
  cardProgress: (id: string) => request<CardProgress>(`/cards/${id}/progress`),
  uploadCardImage: (id: string, image: Blob) =>
    request<CardDto>(`/cards/${id}/image`, { method: "PUT", body: image, headers: { "content-type": image.type } }),
  removeCardImage: (id: string) => request<CardDto>(`/cards/${id}/image`, { method: "DELETE" }),

  gameBests: (deckId: string) => request<GameBest[]>(`/decks/${deckId}/games`),
  playCards: (deckId: string, count: number) => request<CardDto[]>(`/decks/${deckId}/play?count=${count}`),
  submitGame: (input: In<typeof practiceInput>) => request<PracticeResult>("/practice", { method: "POST", json: input }),

  study: (deckId?: string) => request<StudyQueue>(deckId ? `/study?deckId=${encodeURIComponent(deckId)}` : "/study"),
  review: (input: In<typeof reviewInput>) => request<ReviewResult>("/reviews", { method: "POST", json: input }),
  undoReview: (logId: string) => request<CardDto>("/reviews/undo", { method: "POST", json: { logId } }),

  stats: () => request<Stats>("/stats"),
  achievements: () => request<Achievements>("/achievements"),
  markAchievementsSeen: (ids: string[]) => request<void>("/achievements/seen", { method: "POST", json: { ids } }),

  tokens: () => request<ApiTokenInfo[]>("/tokens"),
  createToken: (name: string) => request<CreatedToken>("/tokens", { method: "POST", json: { name } }),
  revokeToken: (id: string) => request<void>(`/tokens/${id}`, { method: "DELETE" }),
};

export const queryKeys = {
  config: ["config"] as const,
  me: ["me"] as const,
  decks: ["decks"] as const,
  deck: (id: string) => ["decks", id] as const,
  cards: (deckId: string) => ["decks", deckId, "cards"] as const,
  stats: ["stats"] as const,
  // Under "stats": whatever refreshes stats (study, games, edits) also checks for new achievements.
  achievements: ["stats", "achievements"] as const,
  games: (deckId: string) => ["decks", deckId, "games"] as const,
  progress: (cardId: string) => ["progress", cardId] as const,
  tokens: ["tokens"] as const,
  // Under "public": changing a deck's visibility or content refreshes what Discover shows.
  publicDecks: ["public", "decks"] as const,
  publicDeck: (id: string) => ["public", "decks", id] as const,
  publicCards: (id: string) => ["public", "decks", id, "cards"] as const,
  public: ["public"] as const,
};
