import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_INFO, MATCH_BOARD_PAIRS, MATCH_PENALTY_MS, WORD_POINTS } from "../../../shared/games";
import type { PlayCard } from "../../../shared/types";
import { CardImage } from "../../components/CardPhoto";
import { Button } from "../../components/ui";
import { cx } from "../../components/classes";
import { usePauseWhenHidden, useStopwatch } from "./hooks";
import { dealMatch, matchCards, refillMatch, type Direction, type MatchBoard } from "./logic";
import { formatSeconds } from "./format";
import type { GameProps } from "./types";

/** How long the right partner of a wrongly picked word stays highlighted. */
const SHOW_PARTNER_MS = 900;

interface Pick {
  card: PlayCard;
  side: Direction;
}

/**
 * Pair every word with its meaning. Words sit in one column and meanings in the other; a matched pair is replaced
 * from the queue, so the board stays full and the last pairs aren't free by elimination. A wrong pair flashes the
 * right partner of the first tile. A word with a photo is matched to its picture. Standard mode is timed (each wrong pair adds a second); relaxed mode has no clock
 * and scores pairs found without a mistake.
 */
export function MatchGame({ cards, langs, mode, onFinish }: GameProps) {
  const { t } = useTranslation();
  const timed = mode === "standard";
  const [deck] = useState(() => matchCards(cards, GAME_INFO.match.cards));
  const queueRef = useRef(deck.slice(MATCH_BOARD_PAIRS));
  const [board, setBoard] = useState<MatchBoard<PlayCard>>(() => dealMatch(deck.slice(0, MATCH_BOARD_PAIRS)));
  const [selected, setSelected] = useState<Pick | null>(null);
  const [matched, setMatched] = useState(0);
  /** Pairs found without a mistake on either tile: relaxed mode's score. */
  const [clean, setClean] = useState(0);
  const [wrongPair, setWrongPair] = useState<[Pick, Pick] | null>(null);
  const [partner, setPartner] = useState<{ card: PlayCard; side: Direction } | null>(null);
  const [penalty, setPenalty] = useState(0);
  const missedRef = useRef(new Set<string>());
  const clock = useStopwatch();
  usePauseWhenHidden(clock.pause, timed);

  const finish = useCallback(() => {
    const time = Math.round(clock.elapsed());
    const answers = deck.map((c) => ({ cardId: c.id, correct: !missedRef.current.has(c.id), format: "pair" as const }));
    const cleanPairs = answers.filter((a) => a.correct).length;
    onFinish({ score: timed ? time + penalty : cleanPairs * WORD_POINTS, durationMs: time, answers });
  }, [clock, deck, onFinish, timed, penalty]);

  const pick = (card: PlayCard, side: Direction) => {
    if (wrongPair || clock.paused) return;
    if (!selected || (selected.card.id === card.id && selected.side === side)) {
      setSelected(selected ? null : { card, side });
      return;
    }
    if (selected.side === side) {
      setSelected({ card, side });
      return;
    }
    if (selected.card.id === card.id) {
      const done = matched + 1;
      setMatched(done);
      if (!missedRef.current.has(card.id)) setClean((n) => n + 1);
      setSelected(null);
      // Taken out of the queue here, not in the updater: React may run updaters twice.
      const next = queueRef.current.shift();
      setBoard((b) => refillMatch(b, card, next));
      if (done === deck.length) finish();
      return;
    }
    missedRef.current.add(selected.card.id).add(card.id);
    if (timed) setPenalty((p) => p + MATCH_PENALTY_MS);
    setWrongPair([selected, { card, side }]);
    // The first tile's real partner, so the miss teaches something.
    setPartner({ card: selected.card, side: side });
    setTimeout(() => {
      setWrongPair(null);
      setSelected(null);
    }, 450);
    setTimeout(() => setPartner(null), SHOW_PARTNER_MS);
  };

  const column = (side: Direction) => (side === "word" ? board.words : board.meanings);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("games.match.progress", { matched, total: deck.length })}</p>
        {timed ? (
          <div className="flex items-center gap-1">
            <Clock elapsed={clock.elapsed} penalty={penalty} />
            <Button
              variant="ghost"
              size="icon"
              onClick={clock.paused ? clock.resume : clock.pause}
              aria-label={clock.paused ? t("games.resume") : t("games.pause")}
            >
              {clock.paused ? <Play /> : <Pause />}
            </Button>
          </div>
        ) : (
          <p className="font-semibold tabular-nums">{t("games.points", { count: clean * WORD_POINTS })}</p>
        )}
      </div>
      {clock.paused ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center">
          <p className="font-medium">{t("games.paused")}</p>
          <Button className="mt-4" onClick={clock.resume} autoFocus>
            <Play />
            {t("games.resume")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(["word", "meaning"] as const).map((side) => (
            <div key={side} className="flex flex-col gap-3">
              {column(side).map((card, slot) =>
                card === null ? (
                  <div key={`empty-${slot}`} className="min-h-20 sm:min-h-24" />
                ) : (
                  <button
                    key={`${card.id}:${side}`}
                    type="button"
                    aria-pressed={selected?.card.id === card.id && selected.side === side}
                    lang={side === "word" ? langs.word : langs.meaning}
                    onClick={() => pick(card, side)}
                    className={cx(
                      "flex min-h-20 animate-pop-in items-center justify-center rounded-xl border bg-card p-3 text-center text-base font-medium break-words transition-[background-color,border-color,color] duration-200 sm:min-h-24",
                      selected?.card.id === card.id && selected.side === side && "border-primary ring-2 ring-primary/20",
                      wrongPair?.some((p) => p.card.id === card.id && p.side === side) &&
                        "animate-shake border-destructive bg-destructive/10 text-destructive",
                      partner?.card.id === card.id && partner.side === side && "border-review ring-2 ring-review/30",
                      side === "meaning" && "text-muted-foreground",
                      "hover:bg-muted/60",
                    )}
                  >
                    {side === "meaning" && card.imageKey ? (
                      // A word with a photo is matched to its picture (named for screen readers).
                      <CardImage imageKey={card.imageKey} alt={card.back} className="h-16 w-full rounded-lg object-cover sm:h-20" />
                    ) : (
                      card[side === "word" ? "front" : "back"]
                    )}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ticks on its own so the board doesn't re-render ten times a second. */
function Clock({ elapsed, penalty }: { elapsed: () => number; penalty: number }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(elapsed()), 100);
    return () => clearInterval(id);
  }, [elapsed]);

  return (
    <p className="font-semibold tabular-nums" aria-live="off">
      {t("games.seconds", { value: formatSeconds(i18n.language, now + penalty) })}
      {penalty > 0 && (
        <span className="ml-2 text-xs font-normal text-destructive">
          {t("games.match.penalty", { value: formatSeconds(i18n.language, penalty) })}
        </span>
      )}
    </p>
  );
}
