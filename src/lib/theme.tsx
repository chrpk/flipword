import { useEffect, useState, type ReactNode } from "react";
import { storage } from "./storage";
import { ThemeContext, type ThemePreference } from "./theme-context";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => (storage.get("theme") as ThemePreference | null) ?? "system",
  );

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = media();
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (pref: ThemePreference) => {
    storage.set("theme", pref);
    setThemeState(pref);
  };

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}
