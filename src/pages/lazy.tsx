import { lazy, Suspense, type ReactNode } from "react";
import { PageSpinner } from "../components/ui";

// Import pulls in sql.js and archive decoders; stats pulls in charts. Load them on demand.
export const ImportPage = lazy(() => import("./ImportPage"));
export const StatsPage = lazy(() => import("./StatsPage"));
export const GamesPage = lazy(() => import("./GamesPage"));
export const GamePage = lazy(() => import("./GamePage"));
export const AchievementsPage = lazy(() => import("./AchievementsPage"));
export const DiscoverPage = lazy(() => import("./DiscoverPage"));
export const SharedDeckPage = lazy(() => import("./SharedDeckPage"));

/** Shows a spinner while a lazily loaded page arrives. */
export function Suspended({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}
