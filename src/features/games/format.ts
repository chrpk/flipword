import { useTranslation } from "react-i18next";
import { GAME_INFO, type GameId } from "../../../shared/games";

export function formatSeconds(locale: string, ms: number) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000);
}

/** Scores read as "12.3 s" for timed games and "80 points" for the rest. */
export function useFormatScore() {
  const { t, i18n } = useTranslation();
  return (game: GameId, score: number) =>
    GAME_INFO[game].lowerIsBetter
      ? t("games.seconds", { value: formatSeconds(i18n.language, score) })
      : t("games.points", { count: score });
}
