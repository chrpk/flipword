import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { achievementGrade, type AchievementGrade } from "../../shared/achievements";
import type { AchievementTrackProgress } from "../../shared/types";
import { Card, ErrorState, PageSpinner, Progress } from "../components/ui";
import { cx } from "../components/classes";
import { GRADE_META, TRACK_META, medalStyle, useAchievementName } from "../features/achievements/meta";
import { api, queryKeys } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";

function TrackCard({ progress, currentStreak }: { progress: AchievementTrackProgress; currentStreak: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const name = useAchievementName();
  const { track, value, tiers } = progress;
  const { icon: Icon, color } = TRACK_META[track];
  const next = tiers.find((tier) => tier.unlockedAt === null);
  const formatValue = (n: number) =>
    track === "streak" ? t("stats.days", { count: n, formatted: formatNumber(lang, n) }) : formatNumber(lang, n);

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t(`achievements.${track}.title`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`achievements.${track}.description`)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatValue(value)}</p>
          {track === "streak" && (
            <p className="text-xs text-muted-foreground">
              {t("achievements.currentStreak", { value: formatValue(currentStreak) })}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        {next ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span>{t("achievements.next", { name: name(track, next.goal) })}</span>
                <GradeLabel grade={achievementGrade(track, next.goal)} />
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(lang, value)} / {formatNumber(lang, next.goal)}
              </span>
            </div>
            <Progress
              value={value / next.goal}
              label={t("achievements.next", { name: name(track, next.goal) })}
            />
          </>
        ) : (
          <p className="text-sm font-medium" style={{ color }}>
            {t("achievements.allUnlocked")}
          </p>
        )}
      </div>

      <ul className="mt-6 flex flex-wrap gap-x-3 gap-y-4">
        {tiers.map((tier) => {
          const unlocked = tier.unlockedAt !== null;
          const label = name(track, tier.goal);
          const grade = achievementGrade(track, tier.goal);
          const gradeName = t(`achievements.grade.${grade}`);
          const status = unlocked
            ? t("achievements.unlockedOn", { date: formatDate(lang, tier.unlockedAt!) })
            : t("achievements.locked");
          return (
            <li key={tier.id} className="flex w-14 flex-col items-center gap-1.5" title={`${label} · ${gradeName} · ${status}`}>
              <span
                className={cx(
                  "flex size-12 items-center justify-center rounded-full",
                  unlocked ? undefined : "border-2 border-dashed bg-muted/50 text-muted-foreground",
                )}
                // Locked tiers keep a hint of their metal in the dashed rim, so the ladder reads ahead of time.
                style={
                  unlocked
                    ? medalStyle(grade)
                    : { borderColor: `color-mix(in srgb, ${GRADE_META[grade].accent} 45%, hsl(var(--border)))` }
                }
              >
                {unlocked ? <Icon className="size-5" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              </span>
              <span className={cx("text-xs font-medium tabular-nums", !unlocked && "text-muted-foreground")} aria-hidden>
                {formatNumber(lang, tier.goal)}
              </span>
              <span className="sr-only">
                {label}, {gradeName}, {status}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Chip naming a grade ("Gold") beside a tiny medal; the text stays in the foreground colour for contrast. */
function GradeLabel({ grade }: { grade: AchievementGrade }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      <span className="size-2.5 rounded-full" style={medalStyle(grade)} aria-hidden />
      {t(`achievements.grade.${grade}`)}
    </span>
  );
}

export default function AchievementsPage() {
  const { t, i18n } = useTranslation();
  const achievements = useQuery({ queryKey: queryKeys.achievements, queryFn: api.achievements });

  if (achievements.isPending) return <PageSpinner />;
  if (achievements.error) return <ErrorState onRetry={() => void achievements.refetch()} />;
  const a = achievements.data;
  const all = a.tracks.flatMap((track) => track.tiers);
  const unlocked = all.filter((tier) => tier.unlockedAt !== null).length;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("achievements.title")}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("achievements.subtitle", {
          unlocked: formatNumber(i18n.language, unlocked),
          total: formatNumber(i18n.language, all.length),
        })}
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {a.tracks.map((track) => (
          <TrackCard key={track.track} progress={track} currentStreak={a.currentStreak} />
        ))}
      </div>
    </div>
  );
}
