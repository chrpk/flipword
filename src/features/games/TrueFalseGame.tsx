import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TRUE_FALSE_MS } from "../../../shared/games";
import { Button, Countdown, Kbd } from "../../components/ui";
import { cx } from "../../components/classes";
import { nextStatement, streakMultiplier, type Statement } from "./logic";
import type { GameAnswer, GameProps } from "./types";

const POINTS = 10;

/** Speed round: does this meaning belong to this word? Streaks multiply points. */
export function TrueFalseGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [statement, setStatement] = useState<Statement>(() => nextStatement(cards, null));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState<"right" | "wrong" | null>(null);
  // Whole seconds only: the bar animates in CSS, so state changes (and re-renders) once a second.
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(TRUE_FALSE_MS / 1000));
  const answersRef = useRef<GameAnswer[]>([]);
  const scoreRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, TRUE_FALSE_MS - (performance.now() - start));
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining === 0 && !doneRef.current) {
        doneRef.current = true;
        clearInterval(id);
        onFinish({ score: scoreRef.current, durationMs: TRUE_FALSE_MS, answers: answersRef.current });
      }
    }, 100);
    return () => clearInterval(id);
  }, [onFinish]);

  const answer = useCallback(
    (saysTrue: boolean) => {
      if (doneRef.current) return;
      const correct = saysTrue === statement.isTrue;
      answersRef.current.push({ cardId: statement.card.id, correct });
      if (correct) {
        const gained = POINTS * streakMultiplier(streak);
        scoreRef.current += gained;
        setScore(scoreRef.current);
        setStreak(streak + 1);
      } else {
        setStreak(0);
      }
      setFlash(correct ? "right" : "wrong");
      setTimeout(() => setFlash(null), 250);
      setStatement(nextStatement(cards, statement.card));
    },
    [statement, streak, cards],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" || e.key === "f" || e.key === "F") answer(false);
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  const multiplier = streakMultiplier(streak);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 space-y-3">
        <Countdown durationMs={TRUE_FALSE_MS} label={t("games.timeLeft")} />
        <div className="flex items-baseline justify-between text-sm">
          <p className="tabular-nums text-muted-foreground">{t("games.truefalse.secondsLeft", { count: secondsLeft })}</p>
          <p className="font-semibold tabular-nums">
            {t("games.points", { count: score })}
            {multiplier > 1 && (
              // Keyed so each step up pops.
              <span key={multiplier} className="ml-2 inline-block animate-pop rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                ×{multiplier}
              </span>
            )}
          </p>
        </div>
      </div>

      <div
        className={cx(
          "flex flex-1 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center transition-colors duration-150",
          flash === "right" && "border-review bg-review/10",
          flash === "wrong" && "border-destructive bg-destructive/10",
        )}
        aria-live="polite"
      >
        {/* Consecutive statements never share a card, so this key changes on every answer. */}
        <div key={statement.card.id} className="animate-pop-in">
          <p lang={langs.word} className="text-4xl font-semibold tracking-tight break-words">
            {statement.card.front}
          </p>
          <p className="my-4 text-sm text-muted-foreground">{t("games.truefalse.means")}</p>
          <p lang={langs.meaning} className="text-2xl font-medium break-words">
            {statement.meaning}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="h-16 border-destructive/30 text-base text-destructive hover:bg-destructive/10"
          onClick={() => answer(false)}
        >
          <X />
          {t("games.truefalse.false")}
          <Kbd>←</Kbd>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-16 border-review/30 text-base text-review hover:bg-review/10"
          onClick={() => answer(true)}
        >
          <Check />
          {t("games.truefalse.true")}
          <Kbd>→</Kbd>
        </Button>
      </div>
    </div>
  );
}
