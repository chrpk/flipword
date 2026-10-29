import { useInfiniteQuery } from "@tanstack/react-query";
import { Compass, Repeat, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { PublicDeck } from "../../shared/types";
import { Button, Card, EmptyState, ErrorState, Input, Spinner } from "../components/ui";
import { cx, stagger } from "../components/classes";
import { api, queryKeys } from "../lib/api";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 24;

function PublicDeckCard({ deck, index }: { deck: PublicDeck; index: number }) {
  const { t, i18n } = useTranslation();
  return (
    <Card className="relative flex animate-rise-in flex-col p-5 transition-shadow hover:shadow-md" style={stagger(index)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold tracking-tight">
          <Link
            to={`/shared/${deck.id}`}
            className="line-clamp-2 break-words after:absolute after:inset-0 after:rounded-xl focus:outline-none"
          >
            {deck.name}
          </Link>
        </h2>
        {deck.isOwn && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {t("discover.yours")}
          </span>
        )}
      </div>
      {deck.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{deck.description}</p>}
      <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-5 text-sm text-muted-foreground">
        <span>{t("decks.cardCount", { count: deck.total, formatted: formatNumber(i18n.language, deck.total) })}</span>
        {deck.authorName && <span>· {t("discover.by", { name: deck.authorName })}</span>}
        {deck.reverseCards && (
          <span className="inline-flex items-center gap-1" title={t("discover.reverse")}>
            · <Repeat className="size-3.5" aria-hidden />
            <span className="sr-only">{t("discover.reverse")}</span>
          </span>
        )}
      </p>
    </Card>
  );
}

export default function DiscoverPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());

  const decks = useInfiniteQuery({
    queryKey: [...queryKeys.publicDecks, { query }],
    queryFn: ({ pageParam }) => api.publicDecks({ q: query, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.decks.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => decks.data?.pages.flatMap((p) => p.decks) ?? [], [decks.data]);
  const total = decks.data?.pages[0]?.total ?? 0;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("discover.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("discover.subtitle")}</p>

      <div className="relative mt-8 sm:w-96">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder={t("discover.search")}
          aria-label={t("discover.search")}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-6">
        {decks.isPending ? (
          <Spinner className="py-16" />
        ) : decks.error ? (
          <ErrorState onRetry={() => void decks.refetch()} />
        ) : rows.length === 0 ? (
          query ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t("discover.noMatches", { q: query })}</p>
          ) : (
            <EmptyState icon={<Compass />} title={t("discover.emptyTitle")} description={t("discover.emptyDescription")} />
          )
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
              {t("discover.count", { count: total, formatted: formatNumber(i18n.language, total) })}
            </p>
            <section
              aria-label={t("discover.title")}
              className={cx("grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3", decks.isPlaceholderData && "opacity-60")}
            >
              {rows.map((d, i) => (
                // Per page, so "Load more" staggers its own batch rather than waiting behind the first.
                <PublicDeckCard key={d.id} deck={d} index={i % PAGE_SIZE} />
              ))}
            </section>
            {decks.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => void decks.fetchNextPage()} loading={decks.isFetchingNextPage}>
                  {t("deck.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
