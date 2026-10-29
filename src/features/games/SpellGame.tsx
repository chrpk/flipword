import { Check, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO } from "../../../shared/games";
import { Button, Input, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { speak, speechSupported } from "../../lib/speech";
import { compareAnswer, type TypedResult } from "../study/typing";
import { DiffText } from "./DiffText";
import type { GameAnswer, GameProps } from "./types";

/** See the meaning (and optionally hear the word), then type the word. */
export function SpellGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [rounds] = useState(() => cards.slice(0, GAME_INFO.spell.cards));
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<TypedResult | null>(null);
  const answersRef = useRef<GameAnswer[]>([]);
  const startRef = useRef(0);
  const card = rounds[index];

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  const listen = useCallback(() => speak(card.front, langs.word), [card, langs.word]);

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (result) return next();
    const r = compareAnswer(typed, card.front, langs.word);
    setResult(r);
    answersRef.current.push({ cardId: card.id, correct: r.correct });
  };

  const giveUp = () => {
    const r = compareAnswer("", card.front, langs.word);
    setResult(r);
    answersRef.current.push({ cardId: card.id, correct: false });
  };

  const next = () => {
    if (index + 1 < rounds.length) {
      setIndex(index + 1);
      setTyped("");
      setResult(null);
      return;
    }
    const answers = answersRef.current;
    onFinish({
      score: answers.filter((a) => a.correct).length,
      durationMs: Math.round(performance.now() - startRef.current),
      answers,
    });
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / rounds.length} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {rounds.length}
        </p>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t("games.spell.prompt")}</p>
      <p key={index} lang={langs.meaning} className="mt-3 animate-rise-in text-center text-4xl font-semibold tracking-tight break-words">
        {card.back}
      </p>
      {speechSupported && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={listen}>
            <Volume2 />
            {t("games.spell.listen")}
          </Button>
        </div>
      )}

      <form onSubmit={check} className="mt-10 space-y-4">
        <Input
          key={card.id}
          autoFocus
          lang={langs.word}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={result !== null}
          aria-label={t("games.spell.placeholder")}
          placeholder={t("games.spell.placeholder")}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={cx("h-14 text-center text-xl", result && !result.correct && "animate-shake")}
        />
        <div className="min-h-16 text-center" aria-live="polite">
          {result?.correct && (
            <p className="inline-flex animate-pop items-center gap-1.5 font-medium text-review">
              <Check className="size-5" aria-hidden />
              {t("games.correct")}
            </p>
          )}
          {result && !result.correct && (
            <div className="animate-rise-in space-y-1">
              {typed.trim() && <DiffText parts={result.parts} lang={langs.word} />}
              <p className="text-sm text-muted-foreground">
                {t("games.correctAnswer")}{" "}
                <span lang={langs.word} className="font-semibold text-foreground">
                  {card.front}
                </span>
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-between gap-3">
          {result === null ? (
            <Button variant="ghost" onClick={giveUp}>
              {t("games.dontKnow")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={result === null && !typed.trim()}>
            {result === null ? t("games.check") : index + 1 < rounds.length ? t("games.next") : t("games.finish")}
          </Button>
        </div>
      </form>
    </div>
  );
}
