import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO } from "../../../shared/games";
import { Button, Kbd, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { buildQuiz, type QuizQuestion } from "./logic";
import type { GameAnswer, GameProps } from "./types";

/** How long a correct pick stays on screen before the next question appears on its own. */
const AUTO_ADVANCE_MS = 700;

/** Multiple choice in both directions: pick the meaning of a word, or the word for a meaning. */
export function QuizGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [questions] = useState<QuizQuestion[]>(() => buildQuiz(cards, GAME_INFO.quiz.cards));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const answersRef = useRef<GameAnswer[]>([]);
  const startRef = useRef(0);
  const doneRef = useRef(false);
  const q = questions[index];

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  const next = useCallback(() => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    if (doneRef.current) return;
    doneRef.current = true;
    const answers = answersRef.current;
    onFinish({
      score: answers.filter((a) => a.correct).length,
      durationMs: Math.round(performance.now() - startRef.current),
      answers,
    });
  }, [index, questions.length, onFinish]);

  const choose = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      answersRef.current.push({ cardId: q.card.id, correct: i === q.answer });
    },
    [picked, q],
  );

  // Correct picks move on by themselves; wrong ones wait so the right answer can sink in.
  useEffect(() => {
    if (picked === null || picked !== q.answer) return;
    const id = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [picked, q, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (picked === null && n >= 1 && n <= q.options.length) choose(n - 1);
      else if (picked !== null && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, q, choose, next]);

  const promptLang = q.direction === "word" ? langs.word : langs.meaning;
  const optionLang = q.direction === "word" ? langs.meaning : langs.word;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / questions.length} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {questions.length}
        </p>
      </div>
      {/* Keyed per question so each one eases in, options a beat after the prompt. */}
      <div key={index} className="animate-fade-in">
        <p className="text-center text-sm text-muted-foreground">
          {q.direction === "word" ? t("games.quiz.pickMeaning") : t("games.quiz.pickWord")}
        </p>
        <p lang={promptLang} className="mt-3 mb-10 text-center text-4xl font-semibold tracking-tight break-words">
          {q.prompt}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((option, i) => {
            const isAnswer = i === q.answer;
            const isPicked = i === picked;
            return (
              <button
                key={i}
                type="button"
                lang={optionLang}
                onClick={() => choose(i)}
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
      </div>
      <div className="mt-8 flex min-h-11 justify-end">
        {picked !== null && (
          <Button size="lg" className="animate-fade-in" onClick={next} autoFocus>
            {index + 1 < questions.length ? t("games.next") : t("games.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}
