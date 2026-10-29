import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Flag, Plus, Repeat, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { VisibilityBadge } from "../components/DeckVisibility";
import { shareUrl } from "../lib/decks";
import { ReportDeckDialog } from "../components/ReportDeckDialog";
import { toast } from "../components/toast";
import { Button, CopyButton, ErrorState, Input, PageSpinner, Spinner } from "../components/ui";
import { buttonClass, cx } from "../components/classes";
import { api, ApiError, queryKeys } from "../lib/api";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 50;

function Unavailable() {
  const { t } = useTranslation();
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("shared.notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("shared.notFoundDescription")}</p>
      <Link to="/discover" className={buttonClass("secondary", "md", "mt-8")}>
        {t("decks.discover")}
      </Link>
    </div>
  );
}

/** A public deck as other users see it: its words, and a button to add a copy to their own decks. */
export default function SharedDeckPage() {
  const { deckId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [reporting, setReporting] = useState(false);
  const query = useDeferredValue(search.trim());

  const deck = useQuery({ queryKey: queryKeys.publicDeck(deckId), queryFn: () => api.publicDeck(deckId) });
  const cards = useInfiniteQuery({
    queryKey: [...queryKeys.publicCards(deckId), { query }],
    queryFn: ({ pageParam }) => api.publicCards(deckId, { q: query, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.cards.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: deck.isSuccess,
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => cards.data?.pages.flatMap((p) => p.cards) ?? [], [cards.data]);

  const copy = useMutation({
    mutationFn: () => api.copyPublicDeck(deckId),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success(t("shared.added", { name: created.name }));
      navigate(`/decks/${created.id}`);
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  if (deck.isPending) return <PageSpinner />;
  if (deck.error) {
    if (deck.error instanceof ApiError && deck.error.status === 404) return <Unavailable />;
    return <ErrorState onRetry={() => void deck.refetch()} />;
  }

  const d = deck.data;
  const total = cards.data?.pages[0]?.total ?? 0;

  return (
    <div>
      <Link
        to="/discover"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("shared.back")}
      </Link>

      <div className="mt-4 min-w-0">
        <h1 className="text-3xl font-bold tracking-tight break-words">{d.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <VisibilityBadge visibility={d.visibility} />
          <span>{t("decks.cardCount", { count: d.total, formatted: formatNumber(i18n.language, d.total) })}</span>
          {d.authorName && <span>· {t("discover.by", { name: d.authorName })}</span>}
          {d.reverseCards && (
            <span className="inline-flex items-center gap-1">
              · <Repeat className="size-3.5" aria-hidden />
              {t("discover.reverse")}
            </span>
          )}
        </p>
        {d.description && <p className="mt-3 max-w-prose text-muted-foreground">{d.description}</p>}
        {!d.isOwn && (
          <Button variant="ghost" size="sm" className="-ml-2 mt-2 text-muted-foreground" onClick={() => setReporting(true)}>
            <Flag />
            {t("report.button")}
          </Button>
        )}
      </div>
      <ReportDeckDialog deck={d} open={reporting} onClose={() => setReporting(false)} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-5">
        <p className={cx("max-w-prose text-sm", !d.isOwn && "text-muted-foreground")}>
          {d.isOwn ? (d.visibility === "public" ? t("shared.own") : t("shared.ownPrivate")) : t("shared.addHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {d.visibility === "public" && <CopyButton text={shareUrl(d.id)} label={t("deck.copyLink")} variant="secondary" />}
          {d.isOwn ? (
            <Link to={`/decks/${d.id}`} className={buttonClass("primary", "lg")}>
              {t("shared.openMine")}
              <ArrowRight />
            </Link>
          ) : (
            <Button size="lg" loading={copy.isPending} disabled={d.total === 0} onClick={() => copy.mutate()}>
              <Plus />
              {t("shared.add")}
            </Button>
          )}
        </div>
      </div>

      <section className="mt-10" aria-label={t("shared.words")}>
        {d.total === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">{t("shared.empty")}</p>
        ) : (
          <>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                placeholder={t("shared.search")}
                aria-label={t("shared.search")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border">
              {cards.isPending ? (
                <Spinner className="py-16" />
              ) : cards.error ? (
                <ErrorState onRetry={() => void cards.refetch()} />
              ) : rows.length === 0 ? (
                <p className="px-6 py-16 text-center text-sm text-muted-foreground">{t("shared.noMatches")}</p>
              ) : (
                <ul className={cx("divide-y", cards.isPlaceholderData && "opacity-60")}>
                  {rows.map((c) => (
                    <li
                      key={c.id}
                      className="grid gap-x-4 gap-y-1 px-5 py-3.5 [contain-intrinsic-size:auto_4rem] [content-visibility:auto] sm:grid-cols-2"
                    >
                      <span className="font-medium break-words">{c.front}</span>
                      <span className="text-sm break-words text-muted-foreground">
                        {c.back}
                        {c.example && <span className="mt-0.5 block text-xs italic">{c.example}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {rows.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t("deck.showing", {
                    shown: formatNumber(i18n.language, rows.length),
                    total: formatNumber(i18n.language, total),
                  })}
                </span>
                {cards.hasNextPage && (
                  <Button variant="secondary" size="sm" onClick={() => void cards.fetchNextPage()} loading={cards.isFetchingNextPage}>
                    {t("deck.loadMore")}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
