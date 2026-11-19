import { Ghost, Heart } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO, SHOWDOWN_HEART_BONUS, SHOWDOWN_HEARTS } from "../../../shared/games";
import { Button, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { speak } from "../../lib/speech";
import { useAdvanceKeys, useTurns } from "./hooks";
import { buildQuestion, buildShowdown, SHOWDOWN_PHASES } from "./logic";
import { ChoiceGrid } from "./parts/ChoiceGrid";
import { LetterBoard, type BoardResult } from "./parts/LetterBoard";
import { TypedAnswer, type TypedVerdict } from "./parts/TypedAnswer";
import { tilePoints, typedPoints } from "./scoring";
import type { GameProps } from "./types";

/** Points for picking the right option, and for any hit on a word that came back after a miss. */
const PICK_POINTS = 5;
const COMEBACK_POINTS = 2;

/**
 * A boss made of the learner's weakest words. Each word is fought three times, getting harder: pick its meaning,
 * build it from tiles, then type it from its meaning. Every right answer is a hit; a wrong one costs a heart, shows the
 * answer, and brings the word back two turns later. Hit the boss for every word in every phase before the hearts run
 * out.
 */
export function ShowdownGame({ cards, pool, langs, accents, lenientAccents, sound, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [plan] = useState(() => buildShowdown(cards, GAME_INFO.showdown.cards));
  // Misses keep coming back until they're hit; the hearts end the game if they don't.
  const { turn, index, record, advance, answers, elapsed } = useTurns(plan, { maxAttempts: Infinity });
  const [hits, setHits] = useState(0);
  const [hearts, setHearts] = useState(SHOWDOWN_HEARTS);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const { card, phase, fallback } = turn.item;
  const health = plan.length - hits;
  const lost = hearts === 0;
  const won = health === 0;

  // A pick: phase 1 asks for the meaning; a word that can't be tiled asks for the word in phase 2.
  const question = useMemo(
    () => buildQuestion(turn.item.card, pool, turn.item.phase === "pick" ? "word" : "meaning"),
    [turn, pool],
  );

  const resolve = useCallback(
    (correct: boolean, points: number) => {
      setAnswered(correct);
      if (correct) {
        setHits((h) => h + 1);
        setScore((s) => s + (turn.attempt === 1 ? points : COMEBACK_POINTS));
      } else {
        setHearts((h) => Math.max(0, h - 1));
      }
      if (sound && phase !== "pick") speak(card.front, langs.word);
    },
    [turn.attempt, sound, phase, card.front, langs.word],
  );

  const onPick = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      const correct = i === question.answer;
      record({ cardId: card.id, correct, format: "choice", confusedWith: correct ? undefined : question.optionCards[i].id });
      resolve(correct, PICK_POINTS);
    },
    [picked, question, record, card.id, resolve],
  );

  const onTiles = useCallback(
    ({ solved, hints }: BoardResult) => {
      record({ cardId: card.id, correct: solved, format: "tiles", hints });
      resolve(solved, tilePoints(solved, hints));
    },
    [record, card.id, resolve],
  );

  const onTyped = useCallback(
    (v: TypedVerdict) => {
      record({ cardId: card.id, correct: v.correct, format: "typed", hints: v.hints, nearMiss: v.nearMiss });
      resolve(v.correct, typedPoints(v));
    },
    [record, card.id, resolve],
  );

  const next = useCallback(() => {
    if (!won && !lost && advance()) {
      setAnswered(null);
      setPicked(null);
      return;
    }
    onFinish({
      score: score + (won ? hearts * SHOWDOWN_HEART_BONUS : 0),
      durationMs: elapsed(),
      answers: answers.current,
      won,
    });
  }, [won, lost, advance, onFinish, score, hearts, elapsed, answers]);

  const isPick = phase === "pick" || fallback;
  useAdvanceKeys(isPick && picked !== null, next);
  const nextLabel = won || lost ? t("games.finish") : t("games.next");
  const phaseNumber = SHOWDOWN_PHASES.indexOf(phase) + 1;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-4">
          <div
            key={`boss-${hits}-${hearts}`}
            className={cx(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl",
              answered === true && "animate-shake bg-review/10 text-review",
              answered === false && "animate-pop bg-destructive/10 text-destructive",
              answered === null && "bg-muted",
            )}
          >
            <Ghost className="size-8" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <p className="font-semibold">{t("games.showdown.boss")}</p>
              <p className="tabular-nums text-muted-foreground">{t("games.showdown.health", { count: health })}</p>
            </div>
            <Progress value={health / plan.length} label={t("games.showdown.bossHealth")} className="mt-2 h-2 rounded-full" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("games.showdown.phase", { number: phaseNumber, name: t(`games.showdown.phases.${phase}`) })}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <p className="flex gap-1" role="img" aria-label={t("games.showdown.hearts", { count: hearts })}>
            {Array.from({ length: SHOWDOWN_HEARTS }, (_, i) => (
              <Heart
                key={i}
                aria-hidden
                className={cx("size-5", i < hearts ? "fill-destructive text-destructive" : "text-muted-foreground/40", i === hearts && answered === false && "animate-pop")}
              />
            ))}
          </p>
          <p className="text-sm font-semibold tabular-nums">{t("games.points", { count: score })}</p>
        </div>
      </div>

      <p className="sr-only" aria-live="assertive">
        {answered === true ? t("games.showdown.hit") : answered === false ? t("games.showdown.struck") : ""}
      </p>
      {(won || lost) && answered !== null && (
        <p className={cx("mb-4 animate-pop text-center font-semibold", won ? "text-review" : "text-destructive")}>
          {won ? t("games.showdown.won") : t("games.showdown.lost")}
        </p>
      )}

      <div key={`${index}`} className="flex flex-1 animate-fade-in flex-col">
        {isPick ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {question.direction === "word" ? t("games.quiz.pickMeaning") : t("games.quiz.pickWord")}
            </p>
            <p
              lang={question.direction === "word" ? langs.word : langs.meaning}
              className="mt-3 mb-8 text-center text-3xl font-semibold tracking-tight break-words"
            >
              {question.prompt}
            </p>
            <ChoiceGrid
              options={question.options}
              answer={question.answer}
              picked={picked}
              onPick={onPick}
              lang={question.direction === "word" ? langs.meaning : langs.word}
            />
            <div className="mt-8 flex min-h-11 justify-end">
              {picked !== null && (
                <Button size="lg" className="animate-fade-in" onClick={next} autoFocus>
                  {nextLabel}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {phase === "tiles" ? t("games.scramble.prompt") : t("games.spell.prompt")}
            </p>
            <p lang={langs.meaning} className="mt-3 mb-8 text-center text-3xl font-semibold tracking-tight break-words">
              {card.back}
            </p>
            {phase === "tiles" ? (
              <LetterBoard key={`${card.id}:${turn.attempt}`} word={card.front} lang={langs.word} onDone={onTiles} onNext={next} nextLabel={nextLabel} />
            ) : (
              <TypedAnswer
                key={`${card.id}:${turn.attempt}`}
                accepted={[card.front]}
                answer={card.front}
                lang={langs.word}
                accents={accents}
                lenientAccents={lenientAccents}
                onJudged={onTyped}
                onNext={next}
                nextLabel={nextLabel}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
