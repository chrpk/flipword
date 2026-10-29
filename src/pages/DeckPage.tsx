import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, FileUp, Gamepad2, Pencil, Play, Plus, Search, Share2, Trash2 } from "lucide-react";
import { memo, useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { State } from "../../shared/srs";
import type { AnswerCounts, CardDto, CardFilter, CardListItem } from "../../shared/types";
import { CardFormDialog } from "../components/CardFormDialog";
import { CardImage } from "../components/CardPhoto";
import { FlagDot, FlagPill } from "../components/Flags";
import { useFlagName } from "../components/flagName";
import { FLAGS } from "../../shared/flags";
import { DeckCounts } from "../components/DeckCounts";
import { dueTotal } from "../lib/counts";
import { DeckFormDialog } from "../components/DeckFormDialog";
import { ShareDialog, VisibilityBadge } from "../components/DeckVisibility";
import { Menu } from "../components/Menu";
import { toast } from "../components/toast";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  PageSpinner,
  Progress,
  SegmentedControl,
  Spinner,
} from "../components/ui";
import { buttonClass, cx } from "../components/classes";
import { api, ApiError, queryKeys } from "../lib/api";
import { formatNumber, formatRelative } from "../lib/format";
import { useNow } from "../lib/useNow";
import { NotFoundPage } from "./NotFoundPage";

const PAGE_SIZE = 50;

/** One-click "I know this word" toggle at the start of each row. */
function LearnedToggle({ card }: { card: CardDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const learned = card.learnedAt !== null;
  const toggle = useMutation({
    mutationFn: () => api.updateCard(card.id, { learned: !learned }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success(saved.learnedAt !== null ? t("card.learnedToast", { front: saved.front }) : t("card.unlearnedToast", { front: saved.front }));
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={learned}
      aria-label={t("card.learnedToggle", { front: card.front })}
      title={learned ? t("card.markNotLearned") : t("card.markLearned")}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      className="flex size-11 shrink-0 items-center justify-center pl-1 sm:ml-1"
    >
      <span
        className={cx(
          "flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          learned ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {/* Pops only when toggled here, not for every learned row on page load. */}
        {learned && <Check className={cx("size-3", toggle.isSuccess && "animate-pop")} strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}

function LearnedProgress({ learned, total }: { learned: number; total: number }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="mb-2 w-56 max-w-full space-y-1.5">
      <p className="text-sm">
        <span className="font-semibold">{t("deck.learnedOf", { count: total, learned: formatNumber(i18n.language, learned), formatted: formatNumber(i18n.language, total) })}</span>
      </p>
      <Progress value={total ? learned / total : 0} label={t("deck.learnedProgress")} />
    </div>
  );
}

/** Right / wrong answer counts, hidden until the word has been answered at least once. */
function AnswerTally({ counts }: { counts: AnswerCounts }) {
  const { t } = useTranslation();
  if (counts.correctCount + counts.wrongCount === 0) return null;
  return (
    <span
      className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground"
      title={t("card.answerTally", { correct: counts.correctCount, wrong: counts.wrongCount })}
    >
      <span className="text-review">✓ {counts.correctCount}</span>
      <span className="text-destructive">✗ {counts.wrongCount}</span>
    </span>
  );
}

function StatusBadge({ card, now }: { card: CardDto; now: number }) {
  const { t, i18n } = useTranslation();
  if (card.learnedAt !== null) {
    return (
      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
        {t("card.learnedBadge")}
      </span>
    );
  }
  if (card.suspended) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {t("card.suspendedBadge")}
      </span>
    );
  }
  if (card.state === State.New) {
    return <span className="rounded-full bg-new/10 px-2 py-0.5 text-xs font-medium text-new">{t("counts.new")}</span>;
  }
  const learning = card.state === State.Learning || card.state === State.Relearning;
  const due = card.due <= now;
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        learning ? "bg-learning/10 text-learning" : "bg-review/10 text-review",
      )}
    >
      {due ? t("card.dueNow") : formatRelative(i18n.language, card.due, now)}
    </span>
  );
}

/** Memoized so typing in the search box doesn't re-render every row while the query is deferred. */
const CardRows = memo(function CardRows({
  rows,
  dimmed,
  onEdit,
}: {
  rows: CardListItem[];
  dimmed: boolean;
  onEdit: (card: CardDto) => void;
}) {
  const now = useNow();
  return (
    <ul className={cx("divide-y", dimmed && "opacity-60")}>
      {rows.map((card) => (
        // content-visibility: rows scrolled off-screen skip layout and paint (long lists after "load more").
        <li
          key={card.id}
          className="flex items-center transition-colors [contain-intrinsic-size:auto_4rem] [content-visibility:auto] hover:bg-muted/50"
        >
          <LearnedToggle card={card} />
          <button
            type="button"
            onClick={() => onEdit(card)}
            className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3.5 pr-4 text-left sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem] sm:pr-5"
          >
            <span className="flex min-w-0 items-center gap-3">
              {card.imageKey && <CardImage imageKey={card.imageKey} alt="" className="size-9 shrink-0 rounded-md border" />}
              <span className="truncate font-medium">{card.front}</span>
              <FlagPill flag={card.flag} className="hidden sm:inline-flex" />
            </span>
            <span className="col-start-1 truncate text-sm text-muted-foreground sm:col-start-2 sm:row-start-1">
              {card.back}
            </span>
            <span className="col-start-2 row-span-2 row-start-1 flex flex-col items-end gap-1 justify-self-end sm:col-start-3 sm:row-span-1 sm:flex-row sm:items-center sm:gap-4">
              <AnswerTally counts={card} />
              <StatusBadge card={card} now={now} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});

export function DeckPage() {
  const { deckId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [filter, setFilter] = useState<CardFilter>("all");
  const [flag, setFlag] = useState(0);
  const flagName = useFlagName();
  const [adding, setAdding] = useState(false);
  const [editingCard, setEditingCard] = useState<CardDto | null>(null);
  const [editingDeck, setEditingDeck] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deck = useQuery({ queryKey: queryKeys.deck(deckId), queryFn: () => api.deck(deckId) });
  const cards = useInfiniteQuery({
    queryKey: [...queryKeys.cards(deckId), { query, filter, flag }],
    queryFn: ({ pageParam }) =>
      api.cards(deckId, { q: query, filter, flag: flag || undefined, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.cards.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: deck.isSuccess,
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => cards.data?.pages.flatMap((p) => p.cards) ?? [], [cards.data]);

  const removeDeck = useMutation({
    mutationFn: () => api.deleteDeck(deckId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.deck(deckId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success(t("deck.deleted"));
      navigate("/", { replace: true });
    },
    onError: () => toast.error(t("errors.deleteFailed")),
  });

  if (deck.isPending) return <PageSpinner />;
  if (deck.error) {
    if (deck.error instanceof ApiError && deck.error.status === 404) return <NotFoundPage />;
    return <ErrorState onRetry={() => void deck.refetch()} />;
  }

  const d = deck.data;
  const due = dueTotal(d);
  const total = cards.data?.pages[0]?.total ?? 0;
  const filtered = query !== "" || filter !== "all" || flag !== 0;

  return (
    <div>
      <Link
        to="/"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("nav.decks")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight break-words">{d.name}</h1>
          <VisibilityBadge visibility={d.visibility} className="mt-2" />
          {d.description && <p className="mt-2 max-w-prose text-muted-foreground">{d.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSharing(true)}>
            <Share2 />
            {t("deck.share")}
          </Button>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus />
            {t("deck.addCard")}
          </Button>
          <Menu
            label={t("deck.actions")}
            items={[
              { label: t("deck.edit"), icon: <Pencil />, onSelect: () => setEditingDeck(true) },
              { label: t("deck.import"), icon: <FileUp />, onSelect: () => navigate(`/import?deck=${d.id}`) },
              { label: t("deck.export"), icon: <Download />, onSelect: () => window.location.assign(api.exportUrl(d.id)) },
              { label: t("deck.delete"), icon: <Trash2 />, destructive: true, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-5">
        <div className="space-y-1">
          {d.total > 0 ? (
            <LearnedProgress learned={d.learnedCount} total={d.total} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("decks.cardCount", { count: d.total, formatted: formatNumber(i18n.language, d.total) })}
            </p>
          )}
          {due > 0 ? (
            <DeckCounts counts={d} />
          ) : (
            <p className="font-medium">
              {d.total === 0
                ? t("deck.noCardsYet")
                : d.nextDue
                  ? t("decks.nextDue", { when: formatRelative(i18n.language, d.nextDue) })
                  : t("decks.doneToday")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {d.total > 0 && (
            <Link to={`/decks/${d.id}/games`} className={buttonClass("secondary", "lg")}>
              <Gamepad2 />
              {t("deck.games")}
            </Link>
          )}
          <Link
            to={`/study?deck=${d.id}`}
            aria-disabled={due === 0}
            className={buttonClass("primary", "lg", due === 0 ? "pointer-events-none opacity-50" : undefined)}
            tabIndex={due === 0 ? -1 : undefined}
          >
            <Play />
            {t("deck.studyNow")}
          </Link>
        </div>
      </div>

      {d.total === 0 ? (
        <div className="mt-8">
          <EmptyState icon={<Plus />} title={t("deck.emptyTitle")} description={t("deck.emptyDescription")}>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t("deck.addCard")}
            </Button>
            <Link to={`/import?deck=${d.id}`} className={buttonClass("secondary")}>
              <FileUp />
              {t("deck.import")}
            </Link>
          </EmptyState>
        </div>
      ) : (
        <section className="mt-10" aria-label={t("deck.cards")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                placeholder={t("deck.searchPlaceholder")}
                aria-label={t("deck.searchPlaceholder")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <SegmentedControl
                label={t("deck.filter")}
                value={filter}
                onChange={setFilter}
                options={(["all", "due", "new", "learning", "review", "learned", "suspended"] as const).map((f) => ({
                  value: f,
                  label: t(`deck.filters.${f}`),
                }))}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("flags.filter")}>
            <span className="text-xs text-muted-foreground">{t("flags.filter")}</span>
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={flag === f}
                onClick={() => setFlag(flag === f ? 0 : f)}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                  flag === f ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <FlagDot flag={f} />
                {flagName(f)}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border">
            {cards.isPending ? (
              <Spinner className="py-16" />
            ) : rows.length === 0 ? (
              <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                {filtered ? t("deck.noMatches") : t("deck.noCardsYet")}
              </p>
            ) : (
              <CardRows rows={rows} dimmed={cards.isPlaceholderData} onEdit={setEditingCard} />
            )}
          </div>
          {rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("deck.showing", { shown: formatNumber(i18n.language, rows.length), total: formatNumber(i18n.language, total) })}</span>
              {cards.hasNextPage && (
                <Button variant="secondary" size="sm" onClick={() => void cards.fetchNextPage()} loading={cards.isFetchingNextPage}>
                  {t("deck.loadMore")}
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <CardFormDialog open={adding} onClose={() => setAdding(false)} deckId={d.id} />
      <CardFormDialog
        open={editingCard !== null}
        onClose={() => setEditingCard(null)}
        deckId={d.id}
        card={editingCard ?? undefined}
      />
      <DeckFormDialog open={editingDeck} onClose={() => setEditingDeck(false)} deck={d} />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} deck={d} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => removeDeck.mutate()}
        loading={removeDeck.isPending}
        title={t("deck.deleteTitle")}
        description={t("deck.deleteDescription", { name: d.name, count: d.total })}
        confirmLabel={t("deck.delete")}
      />
    </div>
  );
}
