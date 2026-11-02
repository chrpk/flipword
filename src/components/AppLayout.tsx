import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Compass, Layers, Settings, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, matchPath, Navigate, NavLink, Outlet, useLocation, useMatches } from "react-router";
import { AchievementWatcher } from "../features/achievements/AchievementWatcher";
import { api, queryKeys } from "../lib/api";
import { cx } from "./classes";
import { Logo } from "./Logo";
import { MeContext, useMe } from "./me";
import { ErrorState, PageSpinner } from "./ui";

/** Keeps the saved time zone in step with the browser, so assistants (MCP) and the app agree on "today". */
function useSyncTimeZone(saved: string | null | undefined) {
  const queryClient = useQueryClient();
  const { mutate, isIdle } = useMutation({
    mutationFn: (timeZone: string) => api.updateSettings({ timeZone }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
  const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    // Once per page load at most; `saved` is undefined until the user has loaded.
    if (saved !== undefined && current && saved !== current && isIdle) mutate(current);
  }, [saved, current, isIdle, mutate]);
}

/**
 * Loads the signed-in user; redirects to login or onboarding as needed. A route can show signed-out visitors
 * something else instead of the login page with `handle: { signedOut: <Page /> }`.
 */
export function RequireAuth({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const route = useMatches().at(-1);
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  useSyncTimeZone(me.data?.settings.timeZone);

  if (me.isPending) return <PageSpinner />;
  if (me.error) return <ErrorState onRetry={() => void me.refetch()} />;
  if (me.data === null) {
    const signedOutPage = (route?.handle as { signedOut?: React.ReactNode } | undefined)?.signedOut;
    return signedOutPage ?? <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!me.data.settings.onboarded && location.pathname !== "/welcome") {
    // Remember where the user was going (e.g. a shared deck link) so onboarding can continue there.
    return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <MeContext value={me.data}>
      {children ?? <Outlet />}
      {me.data.settings.onboarded && <AchievementWatcher />}
    </MeContext>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return <img src={image} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full object-cover" />;
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * The phone tab bar shrinks while the page scrolls down, out of the content's way, and grows back on scrolling up,
 * near the top, or on a tap (as on iPhone).
 */
function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      // iOS rubber-bands past both ends: clamp, so the bounce at the bottom doesn't read as scrolling up.
      const y = Math.min(Math.max(window.scrollY, 0), document.documentElement.scrollHeight - window.innerHeight);
      if (y < 40) setCompact(false);
      else if (y - last > 8) setCompact(true);
      else if (last - y > 8) setCompact(false);
      else return; // jitter: keep measuring from the same point
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return [compact, setCompact] as const;
}

export function AppLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const location = useLocation();
  const [compact, setCompact] = useCompactOnScroll();
  const nav = [
    { to: "/", label: t("nav.decks"), icon: Layers, end: true },
    { to: "/discover", label: t("nav.discover"), icon: Compass, end: false },
    { to: "/stats", label: t("nav.stats"), icon: BarChart3, end: false },
    { to: "/achievements", label: t("nav.achievements"), icon: Trophy, end: false },
    { to: "/settings", label: t("nav.settings"), icon: Settings, end: false },
  ];
  // -1 on pages outside the tabs (a deck, import): the tab bar's lens then fades out.
  const activeTab = nav.findIndex(({ to, end }) => matchPath({ path: to, end }, location.pathname));

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        {t("nav.skipToContent")}
      </a>
      {/* Phones have no top bar: the tab bar at the bottom covers navigation. */}
      <header className="sticky top-0 z-50 hidden border-b bg-background sm:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label={t("app.name")}>
            <Logo className="size-7" />
            <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
          </Link>
          <nav aria-label={t("nav.main")} className="flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    "flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
            <Link to="/settings" className="ml-2 rounded-full" aria-label={me.user.name}>
              <Avatar name={me.user.name} image={me.user.image} />
            </Link>
          </nav>
        </div>
      </header>
      <main
        id="main"
        className="enter-children mx-auto max-w-5xl px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-12 sm:pb-24"
      >
        <Outlet />
      </main>

      {/* Phone tab bar: a floating glass pill within thumb reach; pages scroll on underneath it. Compact, the first tap
          only grows it back, so a tab is never hit blind; focusing it from the keyboard grows it too. */}
      <nav
        aria-label={t("nav.main")}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
      >
        <div
          className={cx(
            "glass pointer-events-auto relative mx-auto grid w-full grid-cols-5 rounded-full transition-[max-width,padding] duration-500 ease-spring",
            compact ? "max-w-64 p-1" : "max-w-md p-1.5",
          )}
          onClickCapture={(e) => {
            if (!compact) return;
            e.preventDefault();
            e.stopPropagation();
            setCompact(false);
          }}
          // Only keyboard focus: a tap focuses the link too, before its click, and would skip the grow-only first tap.
          onFocus={(e) => e.target.matches(":focus-visible") && setCompact(false)}
        >
          <span
            aria-hidden
            className={cx(
              "glass-lens absolute rounded-full",
              compact ? "inset-y-1 left-1 w-[calc((100%-0.5rem)/5)]" : "inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)]",
              activeTab < 0 && "opacity-0",
            )}
            style={{ transform: `translateX(${Math.max(activeTab, 0) * 100}%)` }}
          />
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  "relative flex min-w-0 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-[height,color,scale] duration-500 ease-spring active:scale-90 active:duration-100",
                  compact ? "h-10" : "h-14",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span
                className={cx(
                  "max-w-full truncate pt-0.5 leading-3.5 transition-[max-height,opacity] duration-300",
                  compact ? "max-h-0 opacity-0" : "max-h-5",
                )}
              >
                {label}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
