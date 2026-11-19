import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Marks a missed word that came back: practice, not points. */
export function RetryNote({ attempt }: { attempt: number }) {
  const { t } = useTranslation();
  if (attempt <= 1) return null;
  return (
    <p className="mb-3 flex animate-fade-in items-center justify-center gap-1.5 text-xs font-medium text-learning">
      <RotateCcw className="size-3.5" aria-hidden />
      {t("games.comingBack")}
    </p>
  );
}
