import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../../components/toast";
import { api, queryKeys } from "../../lib/api";
import { useAchievementNameById } from "./meta";

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
      toast.achievement(t("achievements.unlockedMany", { count: fresh.length }));
    } else {
      for (const id of fresh) toast.achievement(t("achievements.unlocked", { name: name(id) }));
    }
    markSeen(fresh);
  }, [unseen, t, name, markSeen]);

  return null;
}
