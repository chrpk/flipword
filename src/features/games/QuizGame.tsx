import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO } from "../../../shared/games";
import { Volume2 } from "lucide-react";
import { CardImage } from "../../components/CardPhoto";
import { Button, Progress } from "../../components/ui";
import { hasVoice, speak } from "../../lib/speech";
import { useAdvanceKeys, useTurns } from "./hooks";
import { buildQuestion, buildQuiz } from "./logic";
import { ChoiceGrid } from "./parts/ChoiceGrid";
import { RetryNote } from "./parts/RetryNote";
import type { GameProps } from "./types";

/** How long a correct pick stays on screen before the next question appears on its own. */
const AUTO_ADVANCE_MS = 700;

/**
 * Multiple choice in both directions: pick the meaning of a word, or the word for a meaning. New words get easy
 * wrong options; known ones get look-alikes and words picked by mistake before. A miss comes back two questions later.
 */
export function QuizGame({ cards, langs, sound, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [questions] = useState(() => buildQuiz(cards, GAME_INFO.quiz.cards, Math.random, { audio: sound && hasVoice(langs.word) }));
  const { turn, index, total, record, advance, answers, elapsed } = useTurns(questions);
  const [picked, setPicked] = useState<number | null>(null);
  // A question that comes back gets freshly shuffled options, so its position can't be remembered.
  const q = useMemo(
    () => (turn.attempt > 1 ? buildQuestion(turn.item.card, cards, turn.item.direction, Math.random, turn.item.cue) : turn.item),
    [turn, cards],
  );

  const next = useCallback(() => {
    if (advance()) {
      setPicked(null);
      return;
    }
    const all = answers.current;
    onFinish({ score: all.filter((a) => a.correct && a.attempt === 1).length, durationMs: elapsed(), answers: all });
  }, [advance, onFinish, answers, elapsed]);

  const choose = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      const correct = i === q.answer;
      record({ cardId: q.card.id, correct, format: "choice", confusedWith: correct ? undefined : q.optionCards[i].id });
    },
    [picked, q, record],
  );

  // Correct picks move on by themselves; wrong ones wait so the right answer can sink in.
  useEffect(() => {
    if (picked === null || picked !== q.answer) return;
    const id = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [picked, q, next]);

  useAdvanceKeys(picked !== null, next);

  // A listening question plays the word as it appears.
  const play = useCallback(() => speak(q.card.front, langs.word), [q, langs.word]);
  useEffect(() => {
    if (q.cue === "audio") play();
  }, [q, play]);

  const promptLang = q.direction === "word" ? langs.word : langs.meaning;
  const optionLang = q.direction === "word" ? langs.meaning : langs.word;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / total} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {total}
        </p>
      </div>
      {/* Keyed per question so each one eases in, options a beat after the prompt. */}
      <div key={index} className="animate-fade-in">
        <RetryNote attempt={turn.attempt} />
        <p className="text-center text-sm text-muted-foreground">
          {q.cue === "photo"
            ? t("games.quiz.pickWordPhoto")
            : q.cue === "audio"
              ? t("games.quiz.listenMeaning")
              : q.direction === "word"
                ? t("games.quiz.pickMeaning")
                : t("games.quiz.pickWord")}
        </p>
        <div className="mt-3 mb-10 flex flex-col items-center gap-3">
          {q.cue === "photo" && q.card.imageKey && (
            <CardImage imageKey={q.card.imageKey} alt={t("games.quiz.photoAlt")} className="max-h-48 rounded-xl object-contain" />
          )}
          {q.cue === "audio" && (
            <Button variant="secondary" size="lg" onClick={play}>
              <Volume2 />
              {t("games.quiz.playWord")}
            </Button>
          )}
          {/* The photo or sound is the clue; its text shows once answered. */}
          {(q.cue === "text" || picked !== null) && (
            <p lang={promptLang} className="animate-fade-in text-center text-4xl font-semibold tracking-tight break-words">
              {q.prompt}
            </p>
          )}
        </div>
        <ChoiceGrid options={q.options} answer={q.answer} picked={picked} onPick={choose} lang={optionLang} />
      </div>
      <div className="mt-8 flex min-h-11 justify-end">
        {picked !== null && (
          <Button size="lg" className="animate-fade-in" onClick={next} autoFocus>
            {index + 1 < total ? t("games.next") : t("games.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}
