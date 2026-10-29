import { Flag as FlagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FLAGS } from "../../shared/flags";
import { cx } from "./classes";
import { useFlagName } from "./flagName";

export function FlagDot({ flag, className }: { flag: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: `var(--flag-${flag})` }}
    />
  );
}

/** Dot plus name: colour is never the only way to tell flags apart. */
export function FlagPill({ flag, className }: { flag: number; className?: string }) {
  const name = useFlagName();
  if (!flag) return null;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <FlagDot flag={flag} />
      {name(flag)}
    </span>
  );
}

export function FlagPicker({ value, onChange }: { value: number; onChange: (flag: number) => void }) {
  const { t } = useTranslation();
  const name = useFlagName();
  return (
    <div role="radiogroup" aria-label={t("flags.label")} className="flex flex-wrap gap-2">
      {[0, ...FLAGS].map((flag) => (
        <button
          key={flag}
          type="button"
          role="radio"
          aria-checked={value === flag}
          onClick={() => onChange(flag)}
          className={cx(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
            value === flag ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {flag ? <FlagDot flag={flag} /> : <FlagIcon className="size-3.5" aria-hidden />}
          {flag ? name(flag) : t("flags.none")}
        </button>
      ))}
    </div>
  );
}
