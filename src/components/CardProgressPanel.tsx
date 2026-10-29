import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, queryKeys } from "../lib/api";
import { formatDate, formatPercent } from "../lib/format";
import { Spinner } from "./ui";
import { cx } from "./classes";

/** Right / wrong answers for a word in study sessions and games, plus its latest answers as a strip. */
export function CardProgressPanel({ cardId }: { cardId: string }) {
  const { t, i18n } = useTranslation();
  const progress = useQuery({ queryKey: queryKeys.progress(cardId), queryFn: () => api.cardProgress(cardId) });

  if (progress.isPending) return <Spinner className="py-4" />;
  if (progress.error) return null;
  const { reviews, games, recent } = progress.data;
  const correct = reviews.correct + games.correct;
  const total = correct + reviews.wrong + games.wrong;

  if (total === 0) return <p className="text-sm text-muted-foreground">{t("card.progress.none")}</p>;

  const rows = [
    { label: t("card.progress.study"), ...reviews },
    { label: t("card.progress.games"), ...games },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{t("card.progress.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("card.progress.accuracy", { value: formatPercent(i18n.language, correct / total) })}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{t("card.progress.source")}</th>
            <th>{t("card.progress.right")}</th>
            <th>{t("card.progress.wrong")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
                {r.label}
              </th>
              <td className="py-1 text-right tabular-nums text-review">✓ {r.correct}</td>
              <td className="w-16 py-1 text-right tabular-nums text-destructive">✗ {r.wrong}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{t("card.progress.recent")}</p>
        <ol className="flex flex-row-reverse justify-end gap-1" aria-label={t("card.progress.recent")}>
          {recent.map((r, i) => (
            <li
              key={i}
              title={`${formatDate(i18n.language, r.at, { dateStyle: "medium", timeStyle: "short" })} · ${
                r.source === "review" ? t("card.progress.study") : t(`games.${r.source}.name`)
              } · ${r.correct ? t("card.progress.right") : t("card.progress.wrong")}`}
              className={cx("size-3 rounded-full", r.correct ? "bg-review" : "bg-destructive")}
            >
              <span className="sr-only">{r.correct ? t("card.progress.right") : t("card.progress.wrong")}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
