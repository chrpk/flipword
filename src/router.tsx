import { createBrowserRouter } from "react-router";
import { AppLayout, RequireAuth } from "./components/AppLayout";
import { DeckPage } from "./pages/DeckPage";
import { DecksPage } from "./pages/DecksPage";
import { LandingPage } from "./pages/LandingPage";
import {
  AchievementsPage,
  DiscoverPage,
  GamePage,
  GamesPage,
  ImportPage,
  SharedDeckPage,
  StatsPage,
  Suspended,
} from "./pages/lazy";
import { PrivacyPage, TermsPage } from "./pages/LegalPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StudyPage } from "./pages/StudyPage";
import { WelcomePage } from "./pages/WelcomePage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  // Public: sign-in providers and app stores link to these, and visitors must be able to read them before signing in.
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/welcome", element: <WelcomePage /> },
      { path: "/study", element: <StudyPage /> },
      { path: "/decks/:deckId/games/:game", element: <Suspended><GamePage /></Suspended> },
      {
        element: <AppLayout />,
        children: [
          // `signedOut`: what RequireAuth shows here instead of sending visitors to the login page.
          { index: true, element: <DecksPage />, handle: { signedOut: <LandingPage /> } },
          { path: "/decks/:deckId", element: <DeckPage /> },
          { path: "/decks/:deckId/games", element: <Suspended><GamesPage /></Suspended> },
          { path: "/discover", element: <Suspended><DiscoverPage /></Suspended> },
          { path: "/shared/:deckId", element: <Suspended><SharedDeckPage /></Suspended> },
          { path: "/import", element: <Suspended><ImportPage /></Suspended> },
          { path: "/stats", element: <Suspended><StatsPage /></Suspended> },
          { path: "/achievements", element: <Suspended><AchievementsPage /></Suspended> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
