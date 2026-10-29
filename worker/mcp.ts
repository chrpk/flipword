import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { DECK_VISIBILITIES, LIMITS } from "../shared/schemas";
import { State } from "../shared/srs";
import type {
  CardDto,
  CardList,
  CardListItem,
  DeckSummary,
  ImportResult,
  PublicCardList,
  PublicDeck,
  PublicDeckList,
} from "../shared/types";
import type { AppEnv } from "./context";

/** Words a single add_cards call accepts; sent to the API in chunks of LIMITS.bulkCards. */
const MAX_BULK = 2000;

const STATUS: Record<number, string> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

type ApiCall = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class ToolError extends Error {}

/** Compact card shape for assistants: text, status and progress, without scheduler internals. */
function word(card: CardDto | CardListItem) {
  return {
    id: card.id,
    deck_id: card.deckId,
    front: card.front,
    back: card.back,
    example: card.example || undefined,
    status: card.learnedAt !== null ? "learned" : card.suspended ? "suspended" : STATUS[card.state],
    due: card.state === State.New ? undefined : new Date(card.due).toISOString(),
    flag: card.flag || undefined,
    has_photo: card.imageKey ? true : undefined,
    ...("correctCount" in card ? { answered_right: card.correctCount, answered_wrong: card.wrongCount } : {}),
  };
}

function deckInfo(d: DeckSummary) {
  return {
    id: d.id,
    name: d.name,
    description: d.description || undefined,
    reverse_cards: d.reverseCards,
    visibility: d.visibility,
    words: d.total,
    learned: d.learnedCount,
    due_today: { new: d.newCount, learning: d.learningCount, review: d.reviewCount },
  };
}

function publicDeckInfo(d: PublicDeck) {
  return {
    id: d.id,
    name: d.name,
    description: d.description || undefined,
    words: d.total,
    author: d.authorName,
    own_deck: d.isOwn || undefined,
  };
}

const visibility = z
  .enum(DECK_VISIBILITIES)
  .describe("private: only the user sees it; public: other users can find, view and copy it (text only)");

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

/** Runs a tool body, turning API errors into MCP tool errors the assistant can read and recover from. */
async function run(body: () => Promise<unknown>) {
  try {
    return ok(await body());
  } catch (e) {
    const message = e instanceof ToolError ? e.message : "Unexpected error";
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

const cardText = z.string().trim().min(1).max(LIMITS.cardField);
const cardEntry = z.object({
  front: cardText.describe("The word or phrase being learned (target language)"),
  back: cardText.describe("Its meaning / translation (native language)"),
  example: z.string().trim().max(LIMITS.cardField).optional().describe("Optional example sentence"),
});

function createServer(api: ApiCall) {
  const server = new McpServer({ name: "flipword", version: "1.0.0" });

  server.registerTool(
    "list_decks",
    {
      title: "List decks",
      description: "List the user's flashcard decks with word counts, learned counts and what is due today.",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => (await api<DeckSummary[]>("GET", "/decks")).map(deckInfo)),
  );

  server.registerTool(
    "create_deck",
    {
      title: "Create deck",
      description: "Create a new deck.",
      inputSchema: {
        name: z.string().trim().min(1).max(LIMITS.deckName),
        description: z.string().trim().max(LIMITS.deckDescription).optional(),
        reverse_cards: z.boolean().optional().describe("Also study each word from meaning to word"),
        visibility: visibility.optional().describe("Default private. Only make a deck public if the user asks to."),
      },
    },
    ({ name, description, reverse_cards, visibility }) =>
      run(async () =>
        deckInfo(await api("POST", "/decks", { name, description, reverseCards: reverse_cards, visibility })),
      ),
  );

  server.registerTool(
    "update_deck",
    {
      title: "Update deck",
      description:
        "Rename a deck, change its description, turn reverse cards on/off, or make it public or private. Confirm with the user before making a deck public.",
      inputSchema: {
        deck_id: z.string(),
        name: z.string().trim().min(1).max(LIMITS.deckName).optional(),
        description: z.string().trim().max(LIMITS.deckDescription).optional(),
        reverse_cards: z.boolean().optional(),
        visibility: visibility.optional(),
      },
    },
    ({ deck_id, name, description, reverse_cards, visibility }) =>
      run(async () => {
        await api("PATCH", `/decks/${encodeURIComponent(deck_id)}`, {
          name,
          description,
          reverseCards: reverse_cards,
          visibility,
        });
        return deckInfo(await api("GET", `/decks/${encodeURIComponent(deck_id)}`));
      }),
  );

  server.registerTool(
    "delete_deck",
    {
      title: "Delete deck",
      description: "Permanently delete a deck with all its words, photos and study history. Confirm with the user first.",
      inputSchema: { deck_id: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ deck_id }) =>
      run(async () => {
        await api("DELETE", `/decks/${encodeURIComponent(deck_id)}`);
        return { deleted: deck_id };
      }),
  );

  server.registerTool(
    "search_public_decks",
    {
      title: "Search public decks",
      description: "Search decks other users have made public, by name or description. Use copy_public_deck to add one.",
      inputSchema: {
        query: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).optional().describe("Default 24"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, limit, offset }) =>
      run(async () => {
        const params = new URLSearchParams({ limit: String(limit ?? 24), offset: String(offset ?? 0) });
        if (query) params.set("q", query);
        const list = await api<PublicDeckList>("GET", `/public/decks?${params}`);
        return { total: list.total, decks: list.decks.map(publicDeckInfo) };
      }),
  );

  server.registerTool(
    "list_public_deck_cards",
    {
      title: "List words in a public deck",
      description: "Preview the words of a public deck (front, back, example), in the author's order.",
      inputSchema: {
        deck_id: z.string(),
        query: z.string().max(200).optional().describe("Search front, back and example"),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ deck_id, query, limit, offset }) =>
      run(async () => {
        const params = new URLSearchParams({ limit: String(limit ?? 50), offset: String(offset ?? 0) });
        if (query) params.set("q", query);
        const id = encodeURIComponent(deck_id);
        const [deck, list] = await Promise.all([
          api<PublicDeck>("GET", `/public/decks/${id}`),
          api<PublicCardList>("GET", `/public/decks/${id}/cards?${params}`),
        ]);
        return {
          deck: publicDeckInfo(deck),
          total: list.total,
          words: list.cards.map((c) => ({ front: c.front, back: c.back, example: c.example || undefined })),
        };
      }),
  );

  server.registerTool(
    "copy_public_deck",
    {
      title: "Copy public deck",
      description:
        "Add a copy of a public deck to the user's decks. The copy is private, with every word new; photos aren't copied.",
      inputSchema: { deck_id: z.string() },
    },
    ({ deck_id }) =>
      run(async () => deckInfo(await api("POST", `/public/decks/${encodeURIComponent(deck_id)}/copy`))),
  );

  server.registerTool(
    "list_cards",
    {
      title: "List words",
      description: "List or search the words in a deck, newest first, with status and right/wrong answer counts.",
      inputSchema: {
        deck_id: z.string(),
        query: z.string().max(200).optional().describe("Search front, back and example"),
        filter: z.enum(["all", "new", "learning", "review", "due", "learned", "suspended"]).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ deck_id, query, filter, limit, offset }) =>
      run(async () => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (filter) params.set("filter", filter);
        params.set("limit", String(limit ?? 50));
        params.set("offset", String(offset ?? 0));
        const list = await api<CardList>("GET", `/decks/${encodeURIComponent(deck_id)}/cards?${params}`);
        return { total: list.total, words: list.cards.map(word) };
      }),
  );

  server.registerTool(
    "add_card",
    {
      title: "Add word",
      description: "Add one word to a deck.",
      inputSchema: { deck_id: z.string(), ...cardEntry.shape },
    },
    ({ deck_id, front, back, example }) =>
      run(async () => word(await api("POST", `/decks/${encodeURIComponent(deck_id)}/cards`, { front, back, example }))),
  );

  server.registerTool(
    "add_cards",
    {
      title: "Add words in bulk",
      description: `Add up to ${MAX_BULK} words to a deck at once. By default words whose front already exists in the deck are skipped.`,
      inputSchema: {
        deck_id: z.string(),
        cards: z.array(cardEntry).min(1).max(MAX_BULK),
        skip_duplicates: z.boolean().optional().describe("Default true"),
      },
    },
    ({ deck_id, cards, skip_duplicates }) =>
      run(async () => {
        let created = 0;
        let skipped = 0;
        for (let i = 0; i < cards.length; i += LIMITS.bulkCards) {
          const res = await api<ImportResult>("POST", `/decks/${encodeURIComponent(deck_id)}/cards/bulk`, {
            cards: cards.slice(i, i + LIMITS.bulkCards),
            skipDuplicates: skip_duplicates ?? true,
          });
          created += res.created;
          skipped += res.skipped;
        }
        return { created, skipped };
      }),
  );

  server.registerTool(
    "update_card",
    {
      title: "Update word",
      description:
        "Change a word's text, move it to another deck, mark it learned or not, suspend it, or set its colour flag (1-5, 0 to clear).",
      inputSchema: {
        card_id: z.string(),
        front: cardText.optional(),
        back: cardText.optional(),
        example: z.string().trim().max(LIMITS.cardField).optional(),
        deck_id: z.string().optional().describe("Move to this deck"),
        learned: z.boolean().optional(),
        suspended: z.boolean().optional(),
        flag: z.number().int().min(0).max(5).optional(),
      },
    },
    ({ card_id, deck_id, ...rest }) =>
      run(async () => word(await api("PATCH", `/cards/${encodeURIComponent(card_id)}`, { ...rest, deckId: deck_id }))),
  );

  server.registerTool(
    "delete_card",
    {
      title: "Delete word",
      description: "Permanently delete a word (both directions, its photo and its history).",
      inputSchema: { card_id: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ card_id }) =>
      run(async () => {
        await api("DELETE", `/cards/${encodeURIComponent(card_id)}`);
        return { deleted: card_id };
      }),
  );

  return server;
}

/**
 * Stateless MCP endpoint (Streamable HTTP, JSON responses). Each tool call goes through the regular REST routes with
 * the caller's own credentials, so validation, limits and ownership checks are exactly the app's.
 */
export async function handleMcp(c: Context<AppEnv>, app: Hono<AppEnv>) {
  const auth = { authorization: c.req.header("authorization") ?? "", cookie: c.req.header("cookie") ?? "" };
  const api: ApiCall = async (method, path, body) => {
    const headers = new Headers(auth);
    // Without this header the API falls back to the user's saved time zone (see requireUser).
    const tz = c.req.header("x-tz-offset");
    if (tz) headers.set("x-tz-offset", tz);
    if (body !== undefined) headers.set("content-type", "application/json");
    const res = await app.request(
      `/api${path}`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      c.env,
      c.executionCtx,
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      throw new ToolError(`${res.status}: ${err?.error ?? err?.message ?? res.statusText}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as never;
  };

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await createServer(api).connect(transport);
  return transport.handleRequest(c.req.raw);
}
