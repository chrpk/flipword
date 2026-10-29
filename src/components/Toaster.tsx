import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Trophy } from "lucide-react";
import { useSyncExternalStore } from "react";
import { currentToasts, subscribeToasts } from "./toast";

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, currentToasts);
  return (
    <div
      aria-live="polite"
      // Below the 4rem header: study controls and primary actions live at the bottom on small screens.
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 pt-[calc(4.75rem+env(safe-area-inset-top))]"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={clsx(
            "pointer-events-auto flex max-w-sm animate-drop-in items-center gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg",
            t.leaving && "toast-out",
          )}
        >
          {t.tone === "success" ? (
            <CircleCheck className="size-4 shrink-0 text-review" aria-hidden />
          ) : t.tone === "achievement" ? (
            <Trophy className="size-4 shrink-0 animate-pop text-learning" style={{ animationDelay: "150ms" }} aria-hidden />
          ) : (
            <CircleAlert className={clsx("size-4 shrink-0 text-destructive")} aria-hidden />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
