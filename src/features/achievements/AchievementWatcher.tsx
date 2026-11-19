import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../../components/toast";
import { api, queryKeys } from "../../lib/api";
import { ACHIEVEMENT_GRADES, achievementGrade, parseAchievementId } from "../../../shared/achievements";
import { medalStyle, useAchievementNameById } from "./meta";

/** Medal style for an id, or none for ids this version doesn't know. */
function badgeFor(id: string) {
  const parsed = parseAchievementId(id);
  return parsed ? medalStyle(achievementGrade(parsed.track, parsed.goal)) : undefined;
}

/** More unlocks than this at once (e.g. a long history on first visit) are summed up in one toast. */
const MAX_TOASTS = 2;

/** Announces newly unlocked achievements with a toast, once per achievement across devices. */
export function AchievementWatcher() {
  const { t } = useTranslation();
  const name = useAchievementNameById();
  const achievements = useQuery({ queryKey: queryKeys.achievements, queryFn: api.achievements });
  const { mutate: markSeen } = useMutation({ mutationFn: api.markAchievementsSeen });
  // Guards against announcing twice while the "seen" request is in flight (and StrictMode's double effects).
  const announced = useRef(new Set<string>());
  const unseen = achievements.data?.unseen;

  useEffect(() => {
    const fresh = unseen?.filter((id) => !announced.current.has(id)) ?? [];
    if (fresh.length === 0) return;
    for (const id of fresh) announced.current.add(id);
    if (fresh.length > MAX_TOASTS) {
      // The summary shows the best medal among them.
      const best = Math.max(
        ...fresh.map((id) => {
          const parsed = parseAchievementId(id);
          return parsed ? ACHIEVEMENT_GRADES.indexOf(achievementGrade(parsed.track, parsed.goal)) : 0;
        }),
      );
      toast.achievement(t("achievements.unlockedMany", { count: fresh.length }), medalStyle(ACHIEVEMENT_GRADES[best]));
    } else {
      for (const id of fresh) toast.achievement(t("achievements.unlocked", { name: name(id) }), badgeFor(id));
    }
    markSeen(fresh);
  }, [unseen, t, name, markSeen]);

  return null;
}
