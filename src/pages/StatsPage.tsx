import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ColumnChart, StackedBar } from "../components/charts";
import { Card, EmptyState, ErrorState, PageSpinner } from "../components/ui";
import { buttonClass } from "../components/classes";
import { api, queryKeys } from "../lib/api";
import { formatDate, formatDuration, formatNumber, formatPercent } from "../lib/format";

/** Day labels come back as YYYY-MM-DD in the user's timezone; format them as local calendar dates. */
function dayDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function StatsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const stats = useQuery({ queryKey: queryKeys.stats, queryFn: api.stats });

  if (stats.isPending) return <PageSpinner />;
  if (stats.error) return <ErrorState onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  const cardTotal = s.states.new + s.states.learning + s.states.relearning + s.states.review;

  if (cardTotal === 0 && s.learned === 0 && s.totalReviews === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("stats.title")}</h1>
        <div className="mt-10">
          <EmptyState icon={<BarChart3 />} title={t("stats.emptyTitle")} description={t("stats.emptyDescription")}>
            <Link to="/" className={buttonClass("primary")}>
              {t("stats.goToDecks")}
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  const short = (day: string) => formatDate(lang, dayDate(day), { month: "short", day: "numeric" });
  const long = (day: string) => formatDate(lang, dayDate(day), { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("stats.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("stats.subtitle")}</p>

      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={t("stats.today")} value={formatNumber(lang, s.today.reviews)} hint={t("stats.reviewsUnit")} />
        <StatTile label={t("stats.timeToday")} value={formatDuration(t, s.today.durationMs)} />
        <StatTile label={t("stats.streak")} value={t("stats.days", { count: s.streak, formatted: formatNumber(lang, s.streak) })} />
        <StatTile
          label={t("stats.retention")}
          value={s.retention === null ? "—" : formatPercent(lang, s.retention)}
          hint={t("stats.retentionHint")}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">{t("stats.reviewsTitle")}</h2>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">{t("stats.reviewsSubtitle")}</p>
          <ColumnChart
            title={t("stats.reviewsTitle")}
            locale={lang}
            highlightLast
            data={s.daily.map((d) => ({
              key: d.day,
              label: short(d.day),
              value: d.reviews,
              detail:
                d.reviews === 0
                  ? t("stats.noReviews")
                  : t("stats.reviewsDetail", {
                      count: d.reviews,
                      formatted: formatNumber(lang, d.reviews),
                      again: formatNumber(lang, d.again),
                    }),
            }))}
          />
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">{t("stats.forecastTitle")}</h2>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">{t("stats.forecastSubtitle")}</p>
          <ColumnChart
            title={t("stats.forecastTitle")}
            locale={lang}
            highlightFirst
            data={s.forecast.map((d, i) => ({
              key: d.day,
              label: i === 0 ? t("stats.todayLabel") : short(d.day),
              value: d.due,
              detail: `${long(d.day)} · ${t("stats.dueDetail", { count: d.due, formatted: formatNumber(lang, d.due) })}`,
            }))}
          />
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">{t("stats.cardsTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("stats.totalCards", { count: cardTotal, formatted: formatNumber(lang, cardTotal) })} ·{" "}
            {t("stats.learnedWords", { count: s.learned, formatted: formatNumber(lang, s.learned) })} ·{" "}
            {t("stats.totalReviews", { count: s.totalReviews, formatted: formatNumber(lang, s.totalReviews) })}
          </p>
        </div>
        <StackedBar
          title={t("stats.cardsTitle")}
          locale={lang}
          segments={[
            { key: "new", label: t("counts.new"), value: s.states.new, color: "bg-new" },
            {
              key: "learning",
              label: t("counts.learning"),
              value: s.states.learning + s.states.relearning,
              color: "bg-learning",
            },
            { key: "review", label: t("stats.mature"), value: s.states.review, color: "bg-review" },
          ]}
        />
      </Card>
    </div>
  );
}
