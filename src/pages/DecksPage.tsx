import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Compass, FileUp, Flame, Globe, Layers, Play, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { DeckSummary } from "../../shared/types";
import { useMe } from "../components/me";
import { DeckCounts } from "../components/DeckCounts";
import { dueTotal } from "../lib/counts";
import { DeckFormDialog } from "../components/DeckFormDialog";
import { Button, Card, EmptyState, ErrorState, PageSpinner } from "../components/ui";
import { buttonClass, stagger } from "../components/classes";
import { api, queryKeys } from "../lib/api";
import { formatNumber, formatRelative } from "../lib/format";

function DeckCard({ deck, index }: { deck: DeckSummary; index: number }) {
  const { t, i18n } = useTranslation();
  const due = dueTotal(deck);
  return (
    <Card className="group relative flex animate-rise-in flex-col p-5 transition-shadow hover:shadow-md" style={stagger(index, 80)}>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 font-semibold tracking-tight">
          <Link
            to={`/decks/${deck.id}`}
            className="truncate after:absolute after:inset-0 after:rounded-xl focus:outline-none"
          >
            {deck.name}
          </Link>
          {deck.visibility === "public" && (
            <Globe className="size-3.5 shrink-0 text-primary" role="img" aria-label={t("decks.public")} />
          )}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("decks.cardCount", { count: deck.total, formatted: formatNumber(i18n.language, deck.total) })}
          {deck.learnedCount > 0 && ` · ${t("decks.learnedCount", { formatted: formatNumber(i18n.language, deck.learnedCount) })}`}
          {deck.description && <span className="block truncate">{deck.description}</span>}
        </p>
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        {due > 0 ? (
          <DeckCounts counts={deck} compact />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-review" aria-hidden />
            {deck.total === 0
              ? t("decks.empty")
              : deck.nextDue
                ? t("decks.nextDue", { when: formatRelative(i18n.language, deck.nextDue) })
                : t("decks.doneToday")}
          </p>
        )}
        {due > 0 && (
          <Link
            to={`/study?deck=${deck.id}`}
            className={buttonClass("primary", "sm", "relative z-10")}
            aria-label={t("decks.studyDeck", { name: deck.name })}
          >
            <Play />
            {t("decks.study")}
          </Link>
        )}
      </div>
    </Card>
  );
}

/** Current study streak; reminds the user to study when today doesn't count yet. Links to achievements. */
function StreakChip() {
  const { t, i18n } = useTranslation();
  const achievements = useQuery({ queryKey: queryKeys.achievements, queryFn: api.achievements });
  if (!achievements.data?.currentStreak) return null;
  const { currentStreak, studiedToday } = achievements.data;
  return (
    <Link
      to="/achievements"
      className="mt-4 inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted"
    >
      <Flame className="size-4 text-learning" aria-hidden />
      {t("decks.streak", { count: currentStreak, formatted: formatNumber(i18n.language, currentStreak) })}
      {!studiedToday && <span className="font-normal text-muted-foreground">· {t("decks.keepStreak")}</span>}
    </Link>
  );
}

export function DecksPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const decks = useQuery({ queryKey: queryKeys.decks, queryFn: api.decks });

  if (decks.isPending) return <PageSpinner />;
  if (decks.error) return <ErrorState onRetry={() => void decks.refetch()} />;

  const totalDue = decks.data.reduce((sum, d) => sum + dueTotal(d), 0);
  const firstName = me.user.name.split(" ")[0];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("decks.greeting", { name: firstName })}</h1>
          <p className="mt-2 text-muted-foreground">
            {decks.data.length === 0
              ? t("decks.subtitleEmpty")
              : totalDue > 0
                ? t("decks.subtitleDue", { count: totalDue, formatted: formatNumber(i18n.language, totalDue) })
                : t("decks.subtitleDone")}
          </p>
          <StreakChip />
        </div>
        <div className="flex gap-2">
          <Link to="/import" className={buttonClass("secondary")}>
            <FileUp />
            {t("decks.import")}
          </Link>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("decks.newDeck")}
          </Button>
        </div>
      </div>

      {decks.data.length === 0 ? (
        <div className="mt-12">
          <EmptyState icon={<Layers />} title={t("decks.emptyTitle")} description={t("decks.emptyDescription")}>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("decks.createFirst")}
            </Button>
            <Link to="/import" className={buttonClass("secondary")}>
              <FileUp />
              {t("decks.importAnkiCsv")}
            </Link>
            <Link to="/discover" className={buttonClass("secondary")}>
              <Compass />
              {t("decks.discover")}
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          {totalDue > 0 && decks.data.length > 1 && (
            <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 bg-muted/40 p-5">
              <div>
                <p className="font-semibold">{t("decks.studyAllTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("decks.studyAllDescription")}</p>
              </div>
              <Button onClick={() => navigate("/study")}>
                <Play />
                {t("decks.studyAll")}
              </Button>
            </Card>
          )}
          <section aria-label={t("nav.decks")} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.data.map((d, i) => (
              <DeckCard key={d.id} deck={d} index={i} />
            ))}
          </section>
        </>
      )}

      <DeckFormDialog open={creating} onClose={() => setCreating(false)} onCreated={(d) => navigate(`/decks/${d.id}`)} />
    </div>
  );
}
