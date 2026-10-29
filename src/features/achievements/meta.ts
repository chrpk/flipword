import { Flame, Gamepad2, GraduationCap, Repeat, type LucideIcon } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { parseAchievementId, type AchievementTrack } from "../../../shared/achievements";
import { formatNumber } from "../../lib/format";

/** Icon and colour per track. Colours are theme tokens; the track's name is always shown alongside. */
export const TRACK_META: Record<AchievementTrack, { icon: LucideIcon; color: string }> = {
  streak: { icon: Flame, color: "hsl(var(--learning))" },
  words: { icon: GraduationCap, color: "hsl(var(--review))" },
  reviews: { icon: Repeat, color: "hsl(var(--new))" },
  games: { icon: Gamepad2, color: "var(--flag-5)" },
};

/** "7-day streak", "500 words learned"… */
export function useAchievementName() {
  const { t, i18n } = useTranslation();
  return useCallback(
    (track: AchievementTrack, goal: number) =>
      t(`achievements.${track}.name`, { count: goal, formatted: formatNumber(i18n.language, goal) }),
    [t, i18n.language],
  );
}

/** Name for a stored id such as "streak-7"; unknown ids (from a newer version) fall back to the id. */
export function useAchievementNameById() {
  const name = useAchievementName();
  return useCallback(
    (id: string) => {
      const parsed = parseAchievementId(id);
      return parsed ? name(parsed.track, parsed.goal) : id;
    },
    [name],
  );
}
