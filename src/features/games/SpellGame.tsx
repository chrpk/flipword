import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO } from "../../../shared/games";
import { CardImage } from "../../components/CardPhoto";
import { Progress } from "../../components/ui";
import { speak } from "../../lib/speech";
import { useTurns } from "./hooks";
import { typedPoints } from "./scoring";
import { RetryNote } from "./parts/RetryNote";
import { TypedAnswer, type TypedVerdict } from "./parts/TypedAnswer";
import type { GameProps } from "./types";

/** See the meaning (and the word's photo, if it has one), then type the word. Hints and listening cost points. */
export function SpellGame({ cards, langs, accents, lenientAccents, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [words] = useState(() => cards.slice(0, GAME_INFO.spell.cards));
  const { turn, index, total, record, advance, answers, elapsed } = useTurns(words);
  const [score, setScore] = useState(0);
  const card = turn.item;

  const judged = useCallback(
    (v: TypedVerdict) => {
      record({ cardId: card.id, correct: v.correct, format: "typed", hints: v.hints, nearMiss: v.nearMiss });
      if (turn.attempt === 1) setScore((s) => s + typedPoints(v));
    },
    [record, card.id, turn.attempt],
  );

  const next = useCallback(() => {
    if (!advance()) onFinish({ score, durationMs: elapsed(), answers: answers.current });
  }, [advance, onFinish, score, elapsed, answers]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / total} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm font-semibold tabular-nums">{t("games.points", { count: score })}</p>
      </div>
      <RetryNote attempt={turn.attempt} />
      <p className="text-center text-sm text-muted-foreground">{t("games.spell.prompt")}</p>
      <div key={`${index}`} className="mt-3 flex animate-rise-in flex-col items-center gap-4">
        {card.imageKey && <CardImage imageKey={card.imageKey} alt="" className="max-h-40 rounded-xl object-contain" />}
        <p lang={langs.meaning} className="text-center text-4xl font-semibold tracking-tight break-words">
          {card.back}
        </p>
      </div>

      <div className="mt-10">
        <TypedAnswer
          key={`${card.id}:${turn.attempt}`}
          accepted={[card.front]}
          answer={card.front}
          lang={langs.word}
          accents={accents}
          lenientAccents={lenientAccents}
          onListen={() => speak(card.front, langs.word)}
          onJudged={judged}
          onNext={next}
          nextLabel={index + 1 < total ? t("games.next") : t("games.finish")}
        />
      </div>
    </div>
  );
}
