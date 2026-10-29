/** Study languages offered in settings (BCP 47 codes understood by speech synthesis). */
export const STUDY_LANGUAGES = [
  "ar", "bg", "ca", "cs", "da", "de", "el", "en", "es", "et", "fa", "fi", "fr", "he", "hi", "hr", "hu", "id",
  "it", "ja", "ko", "lt", "lv", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sr", "sv", "th",
  "tr", "uk", "vi", "zh", "zh-TW",
] as const;

const displayNames = new Map<string, Intl.DisplayNames>();

export function languageName(code: string, displayLocale: string) {
  try {
    let names = displayNames.get(displayLocale);
    if (!names) displayNames.set(displayLocale, (names = new Intl.DisplayNames([displayLocale], { type: "language" })));
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function sortedLanguages(displayLocale: string) {
  return STUDY_LANGUAGES.map((code) => ({ code, name: languageName(code, displayLocale) })).sort((a, b) =>
    a.name.localeCompare(b.name, displayLocale),
  );
}
