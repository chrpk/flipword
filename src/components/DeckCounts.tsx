import { useTranslation } from "react-i18next";
import type { DeckCounts as Counts } from "../../shared/types";
import { formatNumber } from "../lib/format";
import { cx } from "./classes";

/** New / learning / review counts using Anki's colour convention. */
export function DeckCounts({
  counts,
  compact = false,
  className,
}: {
  counts: Pick<Counts, "newCount" | "learningCount" | "reviewCount">;
  compact?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const items = [
    { n: counts.newCount, label: t("counts.new"), color: "text-new" },
    { n: counts.learningCount, label: t("counts.learning"), color: "text-learning" },
    { n: counts.reviewCount, label: t("counts.review"), color: "text-review" },
  ];
  return (
    <dl className={cx("flex flex-wrap items-center text-sm", compact ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <dt className="sr-only">{item.label}</dt>
          <dd className={cx("font-semibold tabular-nums", item.n > 0 ? item.color : "text-muted-foreground/60")}>
            {formatNumber(i18n.language, item.n)}
          </dd>
          <span aria-hidden className="text-xs text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </dl>
  );
}
