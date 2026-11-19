import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO, GAPLINE_CHOICE_POINTS } from "../../../shared/games";
import { Button, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { speak } from "../../lib/speech";
import { useAdvanceKeys, useTurns } from "./hooks";
import { gapRounds, isMature, pickDistractors, shuffle } from "./logic";
import { ChoiceGrid } from "./parts/ChoiceGrid";
import { RetryNote } from "./parts/RetryNote";
import { TypedAnswer, type TypedVerdict } from "./parts/TypedAnswer";
import { typedPoints } from "./scoring";
import type { GameProps } from "./types";

/**
 * Fill the gap in the word's own example sentence, with its meaning as a hint. Words still being learned are picked
 * from four deck words; words already known are typed. A miss comes back a couple of sentences later as a pick.
 * Every answer completes the sentence, which is read aloud when sound is on.
 */
export function GapLineGame({ cards, pool, langs, accents, lenientAccents, sound, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [rounds] = useState(() => gapRounds(cards, langs.word).slice(0, GAME_INFO.gapline.cards));
  const { turn, index, total, record, advance, answers, elapsed } = useTurns(rounds);
  const [score, setScore] = useState(0);
  /** Null until answered, then whether the answer was right. */
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const { card, cloze } = turn.item;
  // Known words are typed; new ones, and any word coming back after a miss, are picked.
  const typed = isMature(card) && turn.attempt === 1;

  // A fresh set of options for every turn, including a word that comes back.
  const choice = useMemo(() => {
    const target = turn.item.card;
    const optionCards = shuffle([target, ...pickDistractors(target, pool, "word", 3)]);
    return { optionCards, answer: optionCards.indexOf(target) };
  }, [turn, pool]);

  const complete = useCallback(
    (right: boolean) => {
      setAnswered(right);
      if (sound) speak(`${cloze.before}${cloze.gap}${cloze.after}`, langs.word);
    },
    [sound, cloze, langs.word],
  );

  const onTyped = useCallback(
    (v: TypedVerdict) => {
      record({ cardId: card.id, correct: v.correct, format: "typed", hints: v.hints, nearMiss: v.nearMiss });
      if (turn.attempt === 1) setScore((s) => s + typedPoints(v));
      complete(v.correct);
    },
    [record, card.id, turn.attempt, complete],
  );

  const onPick = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      const correct = i === choice.answer;
      record({ cardId: card.id, correct, format: "choice", confusedWith: correct ? undefined : choice.optionCards[i].id });
      if (correct && turn.attempt === 1) setScore((s) => s + GAPLINE_CHOICE_POINTS);
      complete(correct);
    },
    [picked, choice, record, card.id, turn.attempt, complete],
  );

  const next = useCallback(() => {
    if (advance()) {
      setAnswered(null);
      setPicked(null);
      return;
    }
    onFinish({ score, durationMs: elapsed(), answers: answers.current });
  }, [advance, onFinish, score, elapsed, answers]);

  useAdvanceKeys(!typed && picked !== null, next);
  const nextLabel = index + 1 < total ? t("games.next") : t("games.finish");

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / total} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm font-semibold tabular-nums">{t("games.points", { count: score })}</p>
      </div>
      <RetryNote attempt={turn.attempt} />
      <p className="text-center text-sm text-muted-foreground">{typed ? t("games.gapline.typePrompt") : t("games.gapline.pickPrompt")}</p>

      <div key={`${index}`} className="mt-4 animate-rise-in rounded-2xl border bg-card p-6 text-center">
        <p lang={langs.word} className="text-2xl leading-relaxed font-medium break-words sm:text-3xl">
          {cloze.before}
          {answered !== null ? (
            <mark
              className={cx(
                "animate-pop rounded-md px-1 font-semibold",
                answered ? "bg-review/15 text-review" : "bg-destructive/10 text-destructive",
              )}
            >
              {cloze.gap}
            </mark>
          ) : (
            <span className="mx-1 inline-block min-w-[4ch] border-b-2 border-primary align-baseline" aria-label={t("games.gapline.blank")}>
              {" "}
            </span>
          )}
          {cloze.after}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("games.gapline.meaning")}{" "}
          <span lang={langs.meaning} className="font-medium text-foreground">
            {card.back}
          </span>
        </p>
      </div>

      <div className="mt-8">
        {typed ? (
          <TypedAnswer
            key={`${card.id}:${turn.attempt}`}
            accepted={cloze.accepted}
            almost={cloze.almost}
            answer={cloze.gap}
            lang={langs.word}
            accents={accents}
            lenientAccents={lenientAccents}
            onListen={() => speak(cloze.gap, langs.word)}
            onJudged={onTyped}
            onNext={next}
            nextLabel={nextLabel}
          />
        ) : (
          <>
            <ChoiceGrid
              options={choice.optionCards.map((c) => c.front)}
              answer={choice.answer}
              picked={picked}
              onPick={onPick}
              lang={langs.word}
            />
            {picked !== null && cloze.gap.toLowerCase() !== card.front.toLowerCase() && (
              <p className="mt-4 animate-fade-in text-center text-sm text-muted-foreground">
                {t("games.gapline.inSentence")}{" "}
                <span lang={langs.word} className="font-semibold text-foreground">
                  {cloze.gap}
                </span>
              </p>
            )}
            <div className="mt-8 flex min-h-11 justify-end">
              {picked !== null && (
                <Button size="lg" className="animate-fade-in" onClick={next} autoFocus>
                  {nextLabel}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
