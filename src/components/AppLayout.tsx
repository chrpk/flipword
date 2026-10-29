import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Compass, Layers, Settings, Trophy } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, Outlet, useLocation, useMatches } from "react-router";
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

export function AppLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const nav = [
    { to: "/", label: t("nav.decks"), icon: Layers, end: true },
    { to: "/discover", label: t("nav.discover"), icon: Compass, end: false },
    { to: "/stats", label: t("nav.stats"), icon: BarChart3, end: false },
    { to: "/achievements", label: t("nav.achievements"), icon: Trophy, end: false },
    { to: "/settings", label: t("nav.settings"), icon: Settings, end: false },
  ];

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        {t("nav.skipToContent")}
      </a>
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label={t("app.name")}>
            <Logo className="size-7" />
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">{t("app.name")}</span>
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
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </NavLink>
            ))}
            <Link to="/settings" className="ml-2 rounded-full" aria-label={me.user.name}>
              <Avatar name={me.user.name} image={me.user.image} />
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="enter-children mx-auto max-w-5xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <Outlet />
      </main>
    </div>
  );
}
