import { Check, Delete, Lightbulb } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO, SCRAMBLE_HINT_COST as HINT_COST } from "../../../shared/games";
import { Button, Progress } from "../../components/ui";
import { cx } from "../../components/classes";
import { letters, scrambleable, scrambleLayout, scrambleLetters } from "./logic";
import type { GameAnswer, GameProps } from "./types";

const POINTS = 10;

interface Tile {
  id: number;
  letter: string;
}

/** Rebuild the word from its shuffled letters. Hints place the next correct letter and cost points. */
export function ScrambleGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [rounds] = useState(() => cards.filter(scrambleable).slice(0, GAME_INFO.scramble.cards));
  const [index, setIndex] = useState(0);
  const card = rounds[index];
  const target = useMemo(() => letters(card.front), [card]);
  const layout = useMemo(() => scrambleLayout(card.front), [card]);
  const [tiles, setTiles] = useState<Tile[]>(() => scrambleLetters(card.front).map((letter, id) => ({ id, letter })));
  const [placed, setPlaced] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [status, setStatus] = useState<"playing" | "solved" | "revealed">("playing");
  const [score, setScore] = useState(0);
  const answersRef = useRef<GameAnswer[]>([]);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  const word = placed.map((id) => tiles.find((tl) => tl.id === id)!.letter).join("");
  const full = placed.length === target.length;
  const isRight = full && word.toLowerCase() === target.join("").toLowerCase();

  /** Places letters; finishing the word right scores the round (hints used so far reduce the points). */
  const commit = useCallback(
    (nextPlaced: number[], hintsUsed: number) => {
      setPlaced(nextPlaced);
      const guess = nextPlaced.map((id) => tiles.find((tl) => tl.id === id)!.letter).join("");
      if (nextPlaced.length !== target.length || guess.toLowerCase() !== target.join("").toLowerCase()) return;
      setStatus("solved");
      setScore((s) => s + Math.max(0, POINTS - hintsUsed * HINT_COST));
      answersRef.current.push({ cardId: card.id, correct: true });
    },
    [tiles, target, card],
  );

  const place = useCallback(
    (id: number) => {
      if (status !== "playing" || placed.includes(id) || placed.length >= target.length) return;
      commit([...placed, id], hints);
    },
    [status, placed, target.length, commit, hints],
  );

  const removeLast = useCallback(() => {
    if (status === "playing") setPlaced(placed.slice(0, -1));
  }, [status, placed]);

  const hint = () => {
    if (status !== "playing") return;
    // Keep the correct prefix, then add the next right letter.
    let keep = 0;
    while (keep < placed.length && tiles.find((tl) => tl.id === placed[keep])!.letter.toLowerCase() === target[keep].toLowerCase()) keep++;
    const kept = placed.slice(0, keep);
    const nextTile = tiles.find((tl) => !kept.includes(tl.id) && tl.letter.toLowerCase() === target[keep].toLowerCase());
    if (!nextTile) return;
    setHints(hints + 1);
    commit([...kept, nextTile.id], hints + 1);
  };

  const reveal = () => {
    setStatus("revealed");
    answersRef.current.push({ cardId: card.id, correct: false });
  };

  const next = useCallback(() => {
    if (index + 1 < rounds.length) {
      const nextCard = rounds[index + 1];
      setIndex(index + 1);
      setTiles(scrambleLetters(nextCard.front).map((letter, id) => ({ id, letter })));
      setPlaced([]);
      setHints(0);
      setStatus("playing");
      return;
    }
    const answers = answersRef.current;
    onFinish({ score, durationMs: Math.round(performance.now() - startRef.current), answers });
  }, [index, rounds, score, onFinish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (status !== "playing") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          next();
        }
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        removeLast();
        return;
      }
      if (e.key.length !== 1) return;
      const tile = tiles.find((tl) => !placed.includes(tl.id) && tl.letter.toLowerCase() === e.key.toLowerCase());
      if (tile) place(tile.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, tiles, placed, place, removeLast, next]);

  const slots = target.map((_, i) => (status === "revealed" ? target[i] : (word[i] ?? "")));

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Progress value={index / rounds.length} className="h-1.5 flex-1 rounded-full" label={t("games.progressLabel")} />
        <p className="text-sm font-semibold tabular-nums">{t("games.points", { count: score })}</p>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t("games.scramble.prompt")}</p>
      <p key={`prompt-${index}`} lang={langs.meaning} className="mt-3 animate-rise-in text-center text-3xl font-semibold tracking-tight break-words">
        {card.back}
      </p>

      <div
        lang={langs.word}
        className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3"
        aria-live="polite"
        aria-label={t("games.scramble.answer")}
      >
        {layout.map((part, p) => (
          // Each word stays together when the board wraps.
          <span key={p} className="flex gap-1.5">
            {part.map((cell, i) =>
              "fixed" in cell ? (
                <span key={i} className="flex w-3 items-end justify-center pb-1 text-xl font-semibold text-muted-foreground">
                  {cell.fixed}
                </span>
              ) : (
                <span
                  key={i}
                  style={status === "solved" ? { animationDelay: `${cell.slot * 45}ms` } : undefined}
                  className={cx(
                    "flex size-11 items-center justify-center rounded-lg border-2 text-xl font-semibold uppercase sm:size-12",
                    status === "solved" && "animate-celebrate border-review bg-review/10 text-review",
                    status === "revealed" && "animate-fade-in border-destructive/40 text-destructive",
                    status === "playing" && full && !isRight && "animate-shake border-destructive",
                    status === "playing" && !(full && !isRight) && (slots[cell.slot] ? "border-primary" : "border-dashed"),
                  )}
                >
                  {slots[cell.slot]}
                </span>
              ),
            )}
          </span>
        ))}
      </div>
      {status === "playing" && full && !isRight && (
        <p className="mt-3 animate-fade-in text-center text-sm text-destructive">{t("games.scramble.notQuite")}</p>
      )}

      {/* Keyed per round: tile ids restart at 0, and fresh tiles should deal in. */}
      <div key={`tiles-${index}`} lang={langs.word} className="mt-8 flex flex-wrap justify-center gap-2">
        {tiles.map((tile, i) => {
          const used = placed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              disabled={used || status !== "playing"}
              onClick={() => place(tile.id)}
              style={{ animationDelay: `${150 + i * 35}ms` }}
              className={cx(
                "flex size-12 animate-pop items-center justify-center rounded-lg border bg-card text-xl font-semibold uppercase shadow-sm transition-[transform,opacity,background-color]",
                used ? "scale-90 opacity-25" : "hover:-translate-y-0.5 hover:bg-muted/60",
              )}
            >
              {tile.letter}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-10">
        {status === "playing" ? (
          <>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={removeLast} disabled={placed.length === 0}>
                <Delete />
                {t("games.scramble.undoLetter")}
              </Button>
              <Button variant="ghost" size="sm" onClick={hint}>
                <Lightbulb />
                {t("games.scramble.hint", { cost: HINT_COST })}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={reveal}>
              {t("games.dontKnow")}
            </Button>
          </>
        ) : (
          <>
            <p className={cx("flex animate-fade-in items-center gap-1.5 text-sm font-medium", status === "solved" ? "text-review" : "text-muted-foreground")}>
              {status === "solved" && <Check className="size-4" aria-hidden />}
              {status === "solved" ? t("games.correct") : t("games.scramble.revealed")}
            </p>
            <Button size="lg" onClick={next} autoFocus>
              {index + 1 < rounds.length ? t("games.next") : t("games.finish")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
