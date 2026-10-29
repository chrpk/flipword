import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "./components/Toaster";
import "./i18n";
import "./index.css";
import { ApiError } from "./lib/api";
import { ThemeProvider } from "./lib/theme";
import { router } from "./router";

/** A session that expires mid-use sends the user back to the login page. */
function onError(error: Error) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== "/login") {
    window.location.assign(`/login`);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // The auth guard handles the initial "who am I" check itself.
      if (query.queryKey[0] !== "me") onError(error);
    },
  }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
