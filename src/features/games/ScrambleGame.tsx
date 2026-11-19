import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO } from "../../../shared/games";
import { Progress } from "../../components/ui";
import { useTurns } from "./hooks";
import { scrambleable } from "./logic";
import { LetterBoard, type BoardResult } from "./parts/LetterBoard";
import { RetryNote } from "./parts/RetryNote";
import { tilePoints } from "./scoring";
import type { GameProps } from "./types";

/**
 * Rebuild the word from its shuffled letters, with its meaning always on screen. Hints place the next right letter
 * and cost points; a missed word comes back a couple of words later (for practice, not points).
 */
export function ScrambleGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [words] = useState(() => cards.filter(scrambleable).slice(0, GAME_INFO.scramble.cards));
  const { turn, index, total, record, advance, answers, elapsed } = useTurns(words);
  const [score, setScore] = useState(0);
  const card = turn.item;

  const done = useCallback(
    ({ solved, hints }: BoardResult) => {
      record({ cardId: card.id, correct: solved, format: "tiles", hints });
      if (turn.attempt === 1) setScore((s) => s + tilePoints(solved, hints));
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
      <p className="text-center text-sm text-muted-foreground">{t("games.scramble.prompt")}</p>
      <p key={`prompt-${index}`} lang={langs.meaning} className="mt-3 mb-10 animate-rise-in text-center text-3xl font-semibold tracking-tight break-words">
        {card.back}
      </p>
      <LetterBoard
        key={`${card.id}:${turn.attempt}`}
        word={card.front}
        lang={langs.word}
        onDone={done}
        onNext={next}
        nextLabel={index + 1 < total ? t("games.next") : t("games.finish")}
      />
    </div>
  );
}
