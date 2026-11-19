/**
 * Language parts of a tag, lower-cased, however the platform writes it: "es-ES", Android's "es_ES" and Firefox
 * Android's "spa-ES-f000" all give ["es"|"spa", "es"].
 */
function parts(tag: string) {
  return tag.toLowerCase().split(/[-_]/);
}

/** Two- and three-letter codes for the same language (enough of ISO 639-2 for the platforms that use it). */
const ALPHA3: Record<string, string> = {
  spa: "es", eng: "en", fra: "fr", fre: "fr", deu: "de", ger: "de", ita: "it", por: "pt", rus: "ru", jpn: "ja",
  zho: "zh", chi: "zh", kor: "ko", nld: "nl", dut: "nl", pol: "pl", tur: "tr", swe: "sv", nor: "no", nob: "nb",
  dan: "da", fin: "fi", ukr: "uk", ces: "cs", cze: "cs", ell: "el", gre: "el", heb: "he", ara: "ar", hin: "hi",
  ind: "id", tha: "th", vie: "vi", hun: "hu", ron: "ro", rum: "ro", cat: "ca", bul: "bg", hrv: "hr", srp: "sr",
};

const base = (tag: string) => {
  const first = parts(tag)[0];
  return ALPHA3[first] ?? first;
};

/** The parts of a speech voice that choosing one needs (kept free of DOM types so it can be tested anywhere). */
export interface VoiceLike {
  lang: string;
  localService: boolean;
}

/**
 * The best installed voice for a language: same language and region, on-device first; then same language. Matches
 * "es-ES", "es_ES" and "spa-ES-f000" alike. Undefined when no voice speaks the language.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | undefined {
  const want = parts(lang);
  const sameRegion = (v: V) => {
    const p = parts(v.lang);
    return base(v.lang) === base(lang) && (want.length < 2 || p.includes(want[1]));
  };
  const local = (v: V) => v.localService;
  const matching = voices.filter((v) => base(v.lang) === base(lang));
  return matching.find((v) => sameRegion(v) && local(v)) ?? matching.find(sameRegion) ?? matching.find(local) ?? matching[0];
}
