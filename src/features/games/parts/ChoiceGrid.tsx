import { Check, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Kbd } from "../../../components/ui";
import { cx } from "../../../components/classes";

/** Up to four options; keys 1–4 pick. After a pick, the right option shows green and a wrong pick red, with icons. */
export function ChoiceGrid({
  options,
  answer,
  picked,
  onPick,
  lang,
}: {
  options: string[];
  answer: number;
  picked: number | null;
  onPick: (index: number) => void;
  lang: string;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (picked !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) onPick(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, options.length, onPick]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option, i) => {
        const isAnswer = i === answer;
        const isPicked = i === picked;
        return (
          <button
            key={i}
            type="button"
            lang={lang}
            onClick={() => onPick(i)}
            disabled={picked !== null}
            style={{ animationDelay: picked === null ? `${80 + i * 40}ms` : undefined }}
            className={cx(
              "flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left font-medium transition-colors",
              picked !== null && isPicked && !isAnswer ? "animate-shake" : "animate-rise-in",
              picked === null && "hover:bg-muted/60",
              picked !== null && isAnswer && "border-review bg-review/10 text-review",
              picked !== null && isPicked && !isAnswer && "border-destructive bg-destructive/10 text-destructive",
              picked !== null && !isAnswer && !isPicked && "opacity-50",
            )}
          >
            <Kbd>{i + 1}</Kbd>
            <span className="flex-1 break-words">{option}</span>
            {picked !== null && isAnswer && <Check className="size-5 shrink-0 animate-pop" aria-label={t("games.correct")} />}
            {picked !== null && isPicked && !isAnswer && <X className="size-5 shrink-0" aria-label={t("games.wrong")} />}
          </button>
        );
      })}
    </div>
  );
}
