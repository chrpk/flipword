import { useTranslation } from "react-i18next";
import { scoreIsTime, type GameId, type GameMode } from "../../../shared/games";

export function formatSeconds(locale: string, ms: number) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000);
}

/** Scores read as "12.3 s" for standard Match and "80 points" for everything else. */
export function useFormatScore() {
  const { t, i18n } = useTranslation();
  return (game: GameId, score: number, mode: GameMode = "standard") =>
    scoreIsTime(game, mode) ? t("games.seconds", { value: formatSeconds(i18n.language, score) }) : t("games.points", { count: score });
}
