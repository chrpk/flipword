import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { GAME_INFO, GAMES } from "../../shared/games";
import { Card, ErrorState, PageSpinner } from "../components/ui";
import { buttonClass, cx } from "../components/classes";
import { GAME_ICONS } from "../features/games/icons";
import { useFormatScore } from "../features/games/format";
import { api, ApiError, queryKeys } from "../lib/api";
import { NotFoundPage } from "./NotFoundPage";

export default function GamesPage() {
  const { deckId = "" } = useParams();
  const { t } = useTranslation();
  const formatBest = useFormatScore();
  const deck = useQuery({ queryKey: queryKeys.deck(deckId), queryFn: () => api.deck(deckId) });
  const bests = useQuery({ queryKey: queryKeys.games(deckId), queryFn: () => api.gameBests(deckId), enabled: deck.isSuccess });

  if (deck.isPending) return <PageSpinner />;
  if (deck.error) {
    if (deck.error instanceof ApiError && deck.error.status === 404) return <NotFoundPage />;
    return <ErrorState onRetry={() => void deck.refetch()} />;
  }

  return (
    <div>
      <Link
        to={`/decks/${deckId}`}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {deck.data.name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t("games.title")}</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">{t("games.subtitle")}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => {
          const Icon = GAME_ICONS[game];
          const info = GAME_INFO[game];
          const best = bests.data?.find((b) => b.game === game);
          const enough = deck.data.total >= info.minCards;
          return (
            <Card key={game} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5" aria-hidden />
                </div>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    info.kind === "recall" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`games.kind.${info.kind}`)}
                </span>
              </div>
              <h2 className="mt-4 font-semibold tracking-tight">{t(`games.${game}.name`)}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`games.${game}.description`)}</p>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {best?.best != null ? (
                    <>
                      <Trophy className="size-4 text-learning" aria-hidden />
                      {t("games.bestLabel", { value: formatBest(game, best.best) })}
                    </>
                  ) : enough ? (
                    t("games.notPlayed")
                  ) : (
                    t("games.needCards", { count: info.minCards })
                  )}
                </p>
                <Link
                  to={`/decks/${deckId}/games/${game}`}
                  aria-disabled={!enough}
                  tabIndex={enough ? undefined : -1}
                  aria-label={t("games.playGame", { name: t(`games.${game}.name`) })}
                  className={buttonClass("primary", "sm", enough ? undefined : "pointer-events-none opacity-50")}
                >
                  <Play />
                  {t("games.play")}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
