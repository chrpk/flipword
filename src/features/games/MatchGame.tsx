import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO, MATCH_PENALTY_MS } from "../../../shared/games";
import { cx } from "../../components/classes";
import { buildMatch, type MatchTile } from "./logic";
import { formatSeconds } from "./format";
import type { GameProps } from "./types";

/** Pair every word with its meaning as fast as possible; each wrong pair adds a time penalty. */
export function MatchGame({ cards, langs, onFinish }: GameProps) {
  const { t } = useTranslation();
  const [tiles] = useState<MatchTile[]>(() => buildMatch(cards, GAME_INFO.match.cards));
  const [selected, setSelected] = useState<MatchTile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [penalty, setPenalty] = useState(0);
  const startRef = useRef(0);
  const missedRef = useRef(new Set<string>());
  const pairs = tiles.length / 2;

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  // `at` is the click's event timestamp, on the same clock as performance.now().
  const pick = (tile: MatchTile, at: number) => {
    if (matched.has(tile.cardId) || wrongPair) return;
    if (!selected || selected.id === tile.id) {
      setSelected(selected?.id === tile.id ? null : tile);
      return;
    }
    if (selected.side === tile.side) {
      setSelected(tile);
      return;
    }
    if (selected.cardId === tile.cardId) {
      const next = new Set(matched).add(tile.cardId);
      setMatched(next);
      setSelected(null);
      if (next.size === pairs) {
        const time = at - startRef.current;
        onFinish({
          score: Math.round(time + penalty),
          durationMs: Math.round(time),
          answers: [...next].map((cardId) => ({ cardId, correct: !missedRef.current.has(cardId) })),
        });
      }
      return;
    }
    missedRef.current.add(selected.cardId).add(tile.cardId);
    setPenalty((p) => p + MATCH_PENALTY_MS);
    setWrongPair([selected.id, tile.id]);
    setTimeout(() => {
      setWrongPair(null);
      setSelected(null);
    }, 450);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-baseline justify-between text-sm">
        <p className="text-muted-foreground">{t("games.match.progress", { matched: matched.size, total: pairs })}</p>
        <Clock startRef={startRef} penalty={penalty} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const done = matched.has(tile.cardId);
          const isWrong = wrongPair?.includes(tile.id);
          const isSelected = selected?.id === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              disabled={done}
              aria-pressed={isSelected}
              lang={tile.side === "word" ? langs.word : langs.meaning}
              onClick={(e) => pick(tile, e.timeStamp)}
              className={cx(
                "flex min-h-24 items-center justify-center rounded-xl border bg-card p-3 text-center text-base font-medium break-words transition-[transform,opacity,background-color,border-color,color] duration-200 sm:min-h-28",
                done && "pointer-events-none scale-95 opacity-0",
                isSelected && "border-primary ring-2 ring-primary/20",
                isWrong && "animate-shake border-destructive bg-destructive/10 text-destructive",
                !done && !isSelected && !isWrong && "hover:bg-muted/60",
                tile.side === "meaning" && "text-muted-foreground",
              )}
            >
              {tile.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Ticks on its own so the tile grid doesn't re-render ten times a second. */
function Clock({ startRef, penalty }: { startRef: RefObject<number>; penalty: number }) {
  const { t, i18n } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(performance.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [startRef]);

  return (
    <p className="font-semibold tabular-nums" aria-live="off">
      {t("games.seconds", { value: formatSeconds(i18n.language, elapsed + penalty) })}
      {penalty > 0 && (
        <span className="ml-2 text-xs font-normal text-destructive">
          {t("games.match.penalty", { value: formatSeconds(i18n.language, penalty) })}
        </span>
      )}
    </p>
  );
}
