import { Check, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TRUE_FALSE_MS, TRUE_FALSE_RELAXED_STATEMENTS } from "../../../shared/games";
import { Button, Countdown, Kbd, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { usePauseWhenHidden } from "./hooks";
import { nextStatement, streakMultiplier, type Statement } from "./logic";
import type { GameAnswer, GameProps } from "./types";

const POINTS = 10;

/**
 * Does this meaning belong to this word? Standard is a 60-second round, relaxed a fixed number of statements with no
 * clock. Runs of right answers multiply points, so accuracy pays more than speed. A wrong answer stops the clock and
 * shows the true pairing until the learner moves on.
 */
export function TrueFalseGame({ cards, langs, mode, onFinish }: GameProps) {
  const { t } = useTranslation();
  const timed = mode === "standard";
  const [statement, setStatement] = useState<Statement>(() => nextStatement(cards, null));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  /** Answers given so far, and whether the last one was right (for the feedback badge). */
  const [given, setGiven] = useState(0);
  const [lastRight, setLastRight] = useState(false);
  const [reveal, setReveal] = useState<{ statement: Statement; saidTrue: boolean } | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  // Whole seconds only: the bar animates in CSS, so state changes (and re-renders) once a second.
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(TRUE_FALSE_MS / 1000));
  const answersRef = useRef<GameAnswer[]>([]);
  const scoreRef = useRef(0);
  const doneRef = useRef(false);
  const remainingRef = useRef(TRUE_FALSE_MS);
  const startRef = useRef(0);
  const shownAtRef = useRef(0);
  const paused = userPaused || reveal !== null;
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish({
      score: scoreRef.current,
      durationMs: timed ? TRUE_FALSE_MS : Math.round(performance.now() - startRef.current),
      answers: answersRef.current,
    });
  }, [onFinish, timed]);

  useEffect(() => {
    startRef.current = performance.now();
    shownAtRef.current = startRef.current;
    if (!timed) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (!pausedRef.current) remainingRef.current = Math.max(0, remainingRef.current - (now - last));
      last = now;
      setSecondsLeft(Math.ceil(remainingRef.current / 1000));
      if (remainingRef.current === 0) {
        clearInterval(id);
        finish();
      }
    }, 100);
    return () => clearInterval(id);
  }, [timed, finish]);

  const pauseNow = useCallback(() => setUserPaused(true), []);
  usePauseWhenHidden(pauseNow, timed);

  const deal = useCallback(
    (previous: Statement) => {
      if (!timed && answersRef.current.length >= TRUE_FALSE_RELAXED_STATEMENTS) return finish();
      setStatement(nextStatement(cards, previous.card));
      shownAtRef.current = performance.now();
    },
    [cards, timed, finish],
  );

  const answer = useCallback(
    (saysTrue: boolean) => {
      if (doneRef.current || paused) return;
      const correct = saysTrue === statement.isTrue;
      answersRef.current.push({
        cardId: statement.card.id,
        correct,
        format: "verify",
        latencyMs: Math.round(performance.now() - shownAtRef.current),
        // Accepting someone else's meaning: the two words are being confused.
        confusedWith: !correct && saysTrue ? statement.meaningCard.id : undefined,
      });
      setGiven(answersRef.current.length);
      setLastRight(correct);
      if (correct) {
        scoreRef.current += POINTS * streakMultiplier(streak);
        setScore(scoreRef.current);
        setStreak(streak + 1);
        deal(statement);
      } else {
        setStreak(0);
        setReveal({ statement, saidTrue: saysTrue });
      }
    },
    [statement, streak, paused, deal],
  );

  const moveOn = useCallback(() => {
    if (!reveal) return;
    setReveal(null);
    deal(reveal.statement);
  }, [reveal, deal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const isFalse = e.key === "ArrowLeft" || e.key === "f" || e.key === "F";
      const isTrue = e.key === "ArrowRight" || e.key === "j" || e.key === "J";
      if (reveal) {
        if (isFalse || isTrue || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          moveOn();
        }
        return;
      }
      if (userPaused) {
        if (e.key === "Enter" || e.key === " " || e.key === "p" || e.key === "P") {
          e.preventDefault();
          setUserPaused(false);
        }
        return;
      }
      if (isFalse) answer(false);
      if (isTrue) answer(true);
      if (timed && (e.key === "p" || e.key === "P")) setUserPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, reveal, moveOn, userPaused, timed]);

  const multiplier = streakMultiplier(streak);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 space-y-3">
        {timed ? (
          <div className="flex items-center gap-3">
            <Countdown durationMs={TRUE_FALSE_MS} paused={paused} label={t("games.timeLeft")} className="h-1.5 flex-1 rounded-full" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setUserPaused(!userPaused)}
              aria-label={userPaused ? t("games.resume") : t("games.pause")}
              disabled={reveal !== null}
            >
              {userPaused ? <Play /> : <Pause />}
            </Button>
          </div>
        ) : (
          <Progress value={given / TRUE_FALSE_RELAXED_STATEMENTS} label={t("games.progressLabel")} />
        )}
        <div className="flex items-baseline justify-between text-sm">
          <p className="tabular-nums text-muted-foreground">
            {timed
              ? t("games.truefalse.secondsLeft", { count: secondsLeft })
              : `${Math.min(given + 1, TRUE_FALSE_RELAXED_STATEMENTS)} / ${TRUE_FALSE_RELAXED_STATEMENTS}`}
          </p>
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

      {userPaused ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center">
          <p className="font-medium">{t("games.paused")}</p>
          <Button className="mt-4" onClick={() => setUserPaused(false)} autoFocus>
            <Play />
            {t("games.resume")}
          </Button>
        </div>
      ) : reveal ? (
        <div className="flex flex-1 animate-fade-in flex-col items-center justify-center rounded-2xl border border-destructive bg-destructive/5 p-8 text-center" aria-live="assertive">
          <p className="inline-flex items-center gap-1.5 font-medium text-destructive">
            <X className="size-5" aria-hidden />
            {reveal.statement.isTrue ? t("games.truefalse.wasTrue") : t("games.truefalse.wasFalse")}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">{t("games.truefalse.actually")}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight break-words">
            <span lang={langs.word}>{reveal.statement.card.front}</span>
            <span className="mx-3 text-muted-foreground">=</span>
            <span lang={langs.meaning}>{reveal.statement.card.back}</span>
          </p>
          {!reveal.statement.isTrue && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("games.truefalse.belongsTo", { meaning: reveal.statement.meaning, word: reveal.statement.meaningCard.front })}
            </p>
          )}
          <Button className="mt-8" onClick={moveOn} autoFocus>
            {t("games.next")}
            <Kbd>↵</Kbd>
          </Button>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center">
          <p aria-live="polite" className="absolute top-3 left-1/2 -translate-x-1/2 text-sm">
            {given > 0 && lastRight && (
              <span key={given} className="inline-flex animate-pop items-center gap-1 font-medium text-review">
                <Check className="size-4" aria-hidden />
                {t("games.correct")}
              </span>
            )}
          </p>
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
      )}

      <div className={cx("mt-6 grid grid-cols-2 gap-3", paused && "invisible")}>
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
