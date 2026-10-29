import { useTranslation } from "react-i18next";
import { GRADES, Rating, type Grade } from "../../../shared/srs";
import { cx } from "../../components/classes";

// Anki's colour convention for the answer buttons.
const GRADE_STYLES: Record<Grade, { key: string; className: string }> = {
  [Rating.Again]: { key: "again", className: "text-destructive hover:bg-destructive/10 border-destructive/25" },
  [Rating.Hard]: { key: "hard", className: "text-learning hover:bg-learning/10 border-learning/25" },
  [Rating.Good]: { key: "good", className: "text-review hover:bg-review/10 border-review/25" },
  [Rating.Easy]: { key: "easy", className: "text-new hover:bg-new/10 border-new/25" },
};

/** The four answer buttons, each labelled with when the card comes back. */
export function GradeButtons({
  intervals,
  onGrade,
  disabled,
}: {
  intervals: Record<Grade, string> | null;
  onGrade: (grade: Grade) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {GRADES.map((g) => (
        <button
          key={g}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(g)}
          className={cx(
            "flex h-16 flex-col items-center justify-center rounded-lg border bg-background transition-[color,background-color,opacity]",
            "disabled:pointer-events-none disabled:opacity-60",
            GRADE_STYLES[g].className,
          )}
        >
          <span className="text-xs font-medium tabular-nums opacity-80">{intervals?.[g]}</span>
          <span className="text-sm font-semibold">{t(`study.grades.${GRADE_STYLES[g].key}`)}</span>
        </button>
      ))}
    </div>
  );
}
