import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Clock, RotateCcw, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";
import { GAME_INFO, GAMES, SCRAMBLE_HINT_COST, type GameId } from "../../shared/games";
import type { CardDto, PracticeResult } from "../../shared/types";
import { useMe } from "../components/me";
import { toast } from "../components/toast";
import { Button, Card, ErrorState, Kbd, PageSpinner } from "../components/ui";
import { buttonClass } from "../components/classes";
import { GAME_CATALOG } from "../features/games/catalog";
import { GAME_ICONS } from "../features/games/icons";
import type { GameOutcome } from "../features/games/types";
import { api, queryKeys } from "../lib/api";
import { formatDuration, formatNumber } from "../lib/format";
import { useFormatScore } from "../features/games/format";

type Phase = { name: "intro" } | { name: "playing"; round: number } | { name: "results"; outcome: GameOutcome; result: PracticeResult | null };

export default function GamePage() {
  const { deckId = "", game = "" } = useParams();
  if (!(GAMES as readonly string[]).includes(game)) return <Navigate to={`/decks/${deckId}/games`} replace />;
  return <GameScreen deckId={deckId} game={game as GameId} />;
}

function GameScreen({ deckId, game }: { deckId: string; game: GameId }) {
  const { t } = useTranslation();
  const { settings } = useMe();
  const queryClient = useQueryClient();
  const entry = GAME_CATALOG[game];
  const info = GAME_INFO[game];
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [round, setRound] = useState(0);
  const exitTo = `/decks/${deckId}/games`;

  // A fresh random draw for every round.
  const cards = useQuery({
    queryKey: ["play", deckId, game, round],
    queryFn: () => api.playCards(deckId, entry.fetchCount),
    staleTime: Infinity,
    gcTime: 0,
  });
  const usable = cards.data ? entry.usable(cards.data) : [];

  const submit = useMutation({
    mutationFn: (outcome: GameOutcome) => api.submitGame({ deckId, game, ...outcome }),
    onSuccess: (result, outcome) => {
      setPhase({ name: "results", outcome, result });
      void queryClient.invalidateQueries({ queryKey: queryKeys.games(deckId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards(deckId) });
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.achievements });
    },
    onError: (_e, outcome) => {
      toast.error(t("games.saveFailed"));
      setPhase({ name: "results", outcome, result: null });
    },
  });

  const finish = useCallback((outcome: GameOutcome) => submit.mutate(outcome), [submit]);
  const start = useCallback(() => setPhase({ name: "playing", round }), [round]);
  const again = () => {
    setRound((r) => r + 1);
    setPhase({ name: "intro" });
  };

  useEffect(() => {
    if (phase.name !== "intro" || !cards.data || usable.length < info.minCards) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.name, cards.data, usable.length, info.minCards, start]);

  const Game = entry.component;
  const Icon = GAME_ICONS[game];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link to={exitTo} className={buttonClass("ghost", "icon", "-ml-2")} aria-label={t("games.exit")}>
            <X />
          </Link>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t(`games.${game}.name`)}</p>
        </div>
      </header>

      <main className="enter-children mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        {cards.isPending || submit.isPending ? (
          <PageSpinner />
        ) : cards.error ? (
          <ErrorState onRetry={() => void cards.refetch()} />
        ) : usable.length < info.minCards ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-medium">{t("games.notEnoughTitle")}</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("games.needCards", { count: info.minCards })}</p>
            <Link to={`/decks/${deckId}`} className={buttonClass("secondary", "md", "mt-6")}>
              {t("games.backToDeck")}
            </Link>
          </div>
        ) : phase.name === "intro" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 flex size-14 animate-pop items-center justify-center rounded-2xl bg-muted" style={{ animationDelay: "100ms" }}>
              <Icon className="size-7" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t(`games.${game}.name`)}</h1>
            <p className="mt-3 max-w-md text-muted-foreground">{t(`games.${game}.howTo`, { cost: SCRAMBLE_HINT_COST })}</p>
            <Button size="lg" className="mt-8" onClick={start} autoFocus>
              {t("games.start")}
              <ArrowRight />
            </Button>
            <p className="mt-3 hidden text-xs text-muted-foreground sm:block">
              <Kbd>↵</Kbd> {t("games.toStart")}
            </p>
          </div>
        ) : phase.name === "playing" ? (
          <Game
            key={phase.round}
            cards={usable}
            langs={{ word: settings.targetLang, meaning: settings.nativeLang }}
            onFinish={finish}
          />
        ) : (
          <Results
            game={game}
            outcome={phase.outcome}
            result={phase.result}
            cards={cards.data ?? []}
            onAgain={again}
            exitTo={exitTo}
          />
        )}
      </main>
    </div>
  );
}

function Results({
  game,
  outcome,
  result,
  cards,
  onAgain,
  exitTo,
}: {
  game: GameId;
  outcome: GameOutcome;
  result: PracticeResult | null;
  cards: CardDto[];
  onAgain: () => void;
  exitTo: string;
}) {
  const { t, i18n } = useTranslation();
  const formatBest = useFormatScore();
  const correct = outcome.answers.filter((a) => a.correct).length;
  const wrong = outcome.answers.length - correct;
  const missedIds = new Set(outcome.answers.filter((a) => !a.correct).map((a) => a.cardId));
  const missed = cards.filter((c) => missedIds.has(c.id));

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      {result?.isBest ? (
        <p className="mb-4 inline-flex animate-pop items-center gap-1.5 rounded-full bg-learning/10 px-3 py-1 text-sm font-medium text-learning" style={{ animationDelay: "450ms" }}>
          <Trophy className="size-4" aria-hidden />
          {t("games.newBest")}
        </p>
      ) : result ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("games.bestLabel", { value: formatBest(game, result.best) })}</p>
      ) : null}
      <p className="text-sm text-muted-foreground">{GAME_INFO[game].lowerIsBetter ? t("games.yourTime") : t("games.yourScore")}</p>
      <p className="mt-1 animate-pop text-6xl font-bold tracking-tight" style={{ animationDelay: "100ms" }}>
        {formatBest(game, outcome.score)}
      </p>

      <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-3">
        {[
          { icon: Check, label: t("games.correctCount"), value: formatNumber(i18n.language, correct) },
          { icon: X, label: t("games.wrongCount"), value: formatNumber(i18n.language, wrong) },
          { icon: Clock, label: t("games.time"), value: formatDuration(t, outcome.durationMs) },
        ].map(({ icon: Icon, label, value }, i) => (
          <Card key={label} className="animate-rise-in p-4" style={{ animationDelay: `${200 + i * 70}ms` }}>
            <Icon className="mx-auto size-4 text-muted-foreground" aria-hidden />
            <dd className="mt-2 text-xl font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </Card>
        ))}
      </dl>

      {missed.length > 0 && (
        <section className="mt-10 w-full max-w-md animate-rise-in text-left" style={{ animationDelay: "420ms" }}>
          <h2 className="text-sm font-semibold">{t("games.toReview")}</h2>
          <ul className="mt-3 divide-y rounded-xl border">
            {missed.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="font-medium">{c.front}</span>
                <span className="text-right text-muted-foreground">{c.back}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to={exitTo} className={buttonClass("secondary")}>
          {t("games.allGames")}
        </Link>
        <Button onClick={onAgain} autoFocus>
          <RotateCcw />
          {t("games.playAgain")}
        </Button>
      </div>
    </div>
  );
}
