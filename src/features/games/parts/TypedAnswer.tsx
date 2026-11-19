import { Check, Lightbulb, Volume2 } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { HINT_COST } from "../../../../shared/games";
import { Button, Input } from "../../../components/ui";
import { cx } from "../../../components/classes";
import { speechSupported } from "../../../lib/speech";
import { judgeTyped, type Judged } from "../../study/typing";
import { DiffText } from "../DiffText";
import { HINT_LEVELS, hintPattern } from "../logic";

export interface TypedVerdict {
  correct: boolean;
  nearMiss: boolean;
  /** Hint levels used, plus one if the learner listened first. */
  hints: number;
}

/**
 * A typed answer with everything typing on a phone needs: an accent strip that inserts at the caret, graded hints
 * (letter count, first letter, first half), an optional Listen hint, Enter that waits for an IME to finish composing,
 * and feedback that always shows the right spelling after a miss.
 */
export function TypedAnswer({
  accepted,
  almost,
  answer,
  lang,
  accents,
  lenientAccents,
  onListen,
  onJudged,
  onNext,
  nextLabel,
  disabled,
}: {
  accepted: string[];
  almost?: string[];
  /** The spelling shown after a miss, and the word the hints are built from. */
  answer: string;
  lang: string;
  accents: string[];
  lenientAccents: boolean;
  /** Shows a Listen button; listening counts as a hint. */
  onListen?: () => void;
  onJudged: (verdict: TypedVerdict, result: Judged) => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [level, setLevel] = useState(0);
  const [listened, setListened] = useState(false);
  const [result, setResult] = useState<Judged | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hints = level + (listened ? 1 : 0);

  const judge = (text: string) => {
    const r = judgeTyped(text, accepted, { almost, lenientAccents, locale: lang });
    setResult(r);
    onJudged({ correct: r.correct, nearMiss: r.nearMiss, hints }, r);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result) return onNext();
    if (typed.trim()) judge(typed);
  };

  // Enter while an IME is composing (Japanese, Chinese, Korean…) picks a candidate; it must not submit.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
  };

  const insert = (ch: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? typed.length;
    const end = input?.selectionEnd ?? typed.length;
    setTyped(typed.slice(0, start) + ch + typed.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const listen = () => {
    onListen?.();
    setListened(true);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {level > 0 && !result && (
        <p lang={lang} className="animate-fade-in text-center font-mono text-xl tracking-wider text-muted-foreground" aria-live="polite">
          <span className="sr-only">{t("games.hintLabel")} </span>
          {hintPattern(answer, level)}
        </p>
      )}
      <Input
        ref={inputRef}
        autoFocus
        lang={lang}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        readOnly={result !== null || disabled}
        aria-label={t("games.typeTheWord")}
        placeholder={t("games.typeTheWord")}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={onKeyDown}
        className={cx("h-14 text-center text-xl", result && !result.correct && "animate-shake")}
      />
      {accents.length > 0 && !result && (
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label={t("games.accents")}>
          {accents.map((ch) => (
            <button
              key={ch}
              type="button"
              lang={lang}
              // Keeps the caret (and the phone keyboard) in the field.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insert(ch)}
              aria-label={t("games.insertChar", { char: ch })}
              className="flex size-11 items-center justify-center rounded-lg border bg-card text-lg hover:bg-muted/60"
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-16 text-center" aria-live="polite">
        {result?.correct && !result.nearMiss && (
          <p className="inline-flex animate-pop items-center gap-1.5 font-medium text-review">
            <Check className="size-5" aria-hidden />
            {t("games.correct")}
          </p>
        )}
        {result?.correct && result.nearMiss && (
          <div className="animate-rise-in space-y-1">
            <p className="inline-flex items-center gap-1.5 font-medium text-learning">
              <Check className="size-5" aria-hidden />
              {t("games.almost")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("games.exactly")}{" "}
              <span lang={lang} className="font-semibold text-foreground">
                {answer}
              </span>
            </p>
          </div>
        )}
        {result && !result.correct && (
          <div className="animate-rise-in space-y-1">
            {typed.trim() && <DiffText parts={result.parts} lang={lang} />}
            <p className="text-sm text-muted-foreground">
              {t("games.correctAnswer")}{" "}
              <span lang={lang} className="font-semibold text-foreground">
                {answer}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {result === null ? (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLevel(level + 1)} disabled={level >= HINT_LEVELS}>
              <Lightbulb />
              {t("games.hint", { cost: HINT_COST })}
            </Button>
            {onListen && speechSupported && (
              <Button variant="ghost" size="sm" onClick={listen}>
                <Volume2 />
                {t("games.listenHint")}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => judge("")}>
              {t("games.dontKnow")}
            </Button>
          </div>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" className="ml-auto" disabled={result === null && !typed.trim()}>
          {result === null ? t("games.check") : nextLabel}
        </Button>
      </div>
    </form>
  );
}
