import { Flame, Gamepad2, GraduationCap, Repeat, type LucideIcon } from "lucide-react";
import { useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { parseAchievementId, type AchievementGrade, type AchievementTrack } from "../../../shared/achievements";
import { formatNumber } from "../../lib/format";

/** Icon and colour per track. Colours are theme tokens; the track's name is always shown alongside. */
export const TRACK_META: Record<AchievementTrack, { icon: LucideIcon; color: string }> = {
  streak: { icon: Flame, color: "hsl(var(--learning))" },
  words: { icon: GraduationCap, color: "hsl(var(--review))" },
  reviews: { icon: Repeat, color: "hsl(var(--new))" },
  games: { icon: Gamepad2, color: "var(--flag-5)" },
};

/**
 * Medal look per grade: a metallic gradient (light → dark), the icon colour on top of it, and a solid accent for small
 * marks (the toast trophy, the grade label). The same in both themes, like a real medal; the grade's name is always
 * available as text (label, tooltip, screen-reader text), so colour is never the only cue.
 */
export const GRADE_META: Record<AchievementGrade, { light: string; dark: string; ink: string; accent: string }> = {
  bronze: { light: "#e8b48a", dark: "#8a4b22", ink: "#fff8f1", accent: "#b06a35" },
  silver: { light: "#f6f7f9", dark: "#8d96a3", ink: "#323a46", accent: "#7d8794" },
  gold: { light: "#ffe58f", dark: "#c98a06", ink: "#5c3b00", accent: "#c48a00" },
  platinum: { light: "#eef6fb", dark: "#6f9bb8", ink: "#1d3b50", accent: "#4f86a8" },
  diamond: { light: "#d9f6ff", dark: "#7b6cf0", ink: "#1f1d5c", accent: "#7468e8" },
};

/** Inline style for a medal badge of `grade`. */
export function medalStyle(grade: AchievementGrade): CSSProperties {
  const { light, dark, ink } = GRADE_META[grade];
  return {
    color: ink,
    backgroundImage: `linear-gradient(145deg, ${light} 0%, color-mix(in srgb, ${light} 45%, ${dark}) 55%, ${dark} 100%)`,
    boxShadow: `inset 0 1.5px 0 rgb(255 255 255 / 0.55), inset 0 -2px 0 rgb(0 0 0 / 0.18), 0 0 0 1.5px color-mix(in srgb, ${dark} 70%, transparent), 0 2px 6px -1px color-mix(in srgb, ${dark} 55%, transparent)`,
  };
}

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
