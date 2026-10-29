import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { storage } from "../lib/storage";
import en from "./locales/en.json";

/** Interface languages. Add a locale file and an entry here to ship a new language. */
export const UI_LOCALES = [{ code: "en", name: "English" }] as const;

export type UiLocale = (typeof UI_LOCALES)[number]["code"];

const resources = { en: { translation: en } } satisfies Record<UiLocale, unknown>;

function initialLocale(): UiLocale {
  const saved = storage.get("locale");
  const candidates = [saved, ...navigator.languages].filter(Boolean) as string[];
  for (const c of candidates) {
    const match = UI_LOCALES.find((l) => l.code === c || l.code === c.split("-")[0]);
    if (match) return match.code;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale(),
  fallbackLng: "en",
  supportedLngs: UI_LOCALES.map((l) => l.code),
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export function setUiLocale(locale: UiLocale) {
  storage.set("locale", locale);
  void i18n.changeLanguage(locale);
}

export default i18n;
