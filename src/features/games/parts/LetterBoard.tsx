import { Check, Delete, Lightbulb } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HINT_COST } from "../../../../shared/games";
import { Button } from "../../../components/ui";
import { cx } from "../../../components/classes";
import { letters, scrambleLayout, scrambleLetters } from "../logic";

interface Tile {
  id: number;
  letter: string;
}

export interface BoardResult {
  solved: boolean;
  hints: number;
}

/**
 * Rebuild a word from its shuffled letters (tap or type; Backspace removes). Spaces and punctuation stay fixed;
 * a hint places the next right letter. Key the board by word so every word starts fresh.
 */
export function LetterBoard({
  word,
  lang,
  onDone,
  onNext,
  nextLabel,
}: {
  word: string;
  lang: string;
  onDone: (result: BoardResult) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const { t } = useTranslation();
  const target = useMemo(() => letters(word), [word]);
  const layout = useMemo(() => scrambleLayout(word), [word]);
  const [tiles] = useState<Tile[]>(() => scrambleLetters(word).map((letter, id) => ({ id, letter })));
  const [placed, setPlaced] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [status, setStatus] = useState<"playing" | "solved" | "revealed">("playing");

  const spell = (ids: number[]) => ids.map((id) => tiles.find((tl) => tl.id === id)!.letter).join("");
  const typed = spell(placed);
  const full = placed.length === target.length;
  const isRight = full && typed.toLowerCase() === target.join("").toLowerCase();

  const commit = useCallback(
    (next: number[], hintsUsed: number) => {
      setPlaced(next);
      const guess = next.map((id) => tiles.find((tl) => tl.id === id)!.letter).join("");
      if (next.length !== target.length || guess.toLowerCase() !== target.join("").toLowerCase()) return;
      setStatus("solved");
      onDone({ solved: true, hints: hintsUsed });
    },
    [tiles, target, onDone],
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
    onDone({ solved: false, hints });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (status !== "playing") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNext();
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
  }, [status, tiles, placed, place, removeLast, onNext]);

  const slots = target.map((_, i) => (status === "revealed" ? target[i] : (typed[i] ?? "")));

  return (
    <div className="flex flex-1 flex-col">
      <div lang={lang} className="flex flex-wrap justify-center gap-x-6 gap-y-3" aria-live="polite" aria-label={t("games.scramble.answer")}>
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

      <div lang={lang} className="mt-8 flex flex-wrap justify-center gap-2">
        {tiles.map((tile, i) => {
          const used = placed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              disabled={used || status !== "playing"}
              onClick={() => place(tile.id)}
              aria-label={tile.letter}
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
                {t("games.hint", { cost: HINT_COST })}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={reveal}>
              {t("games.dontKnow")}
            </Button>
          </>
        ) : (
          <>
            <p
              className={cx(
                "flex animate-fade-in items-center gap-1.5 text-sm font-medium",
                status === "solved" ? "text-review" : "text-muted-foreground",
              )}
            >
              {status === "solved" && <Check className="size-4" aria-hidden />}
              {status === "solved" ? t("games.correct") : t("games.scramble.revealed")}
            </p>
            <Button size="lg" onClick={onNext} autoFocus>
              {nextLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
