import { createContext, useContext } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const ThemeContext = createContext<{ theme: ThemePreference; setTheme: (t: ThemePreference) => void } | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
