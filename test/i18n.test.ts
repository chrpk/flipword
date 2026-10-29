import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_TRACK_IDS } from "../shared/achievements";
import { GAMES } from "../shared/games";
import { DECK_VISIBILITIES, REPORT_REASONS } from "../shared/schemas";
import en from "../src/i18n/locales/en.json";
import { LEGAL_SECTIONS } from "../src/lib/legal";

const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function flatten(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const available = new Set(flatten(en).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, "")));

describe("i18n", () => {
  it("has an English string for every static key used in the app", () => {
    const used = new Set<string>();
    for (const code of Object.values(sources)) {
      for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
      for (const m of code.matchAll(/labelKey: "([\w.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter((k) => !available.has(k))).toEqual([]);
  });

  it("covers keys built at runtime", () => {
    const dynamic = [
      ...["minute", "hour", "day", "month", "year"].map((u) => `interval.${u}`),
      ...["all", "due", "new", "learning", "review", "learned", "suspended"].map((f) => `deck.filters.${f}`),
      ...["again", "hard", "good", "easy"].map((g) => `study.grades.${g}`),
      ...["front", "back", "example"].map((r) => `import.roles.${r}`),
      ...GAMES.flatMap((g) => ["name", "description", "howTo"].map((k) => `games.${g}.${k}`)),
      ...["recognition", "recall"].map((k) => `games.kind.${k}`),
      ...[1, 2, 3, 4, 5].map((f) => `flags.default.${f}`),
      ...DECK_VISIBILITIES.flatMap((v) => [`deck.${v}`, `deck.${v}Hint`]),
      ...["claude-code", "claude-desktop", "cursor"].map((c) => `mcp.instructions.${c}`),
      ...ACHIEVEMENT_TRACK_IDS.flatMap((track) => ["title", "description", "name"].map((k) => `achievements.${track}.${k}`)),
      ...REPORT_REASONS.map((r) => `report.reasons.${r}`),
      ...Object.entries(LEGAL_SECTIONS).flatMap(([page, sections]) => [
        `legal.${page}.title`,
        `legal.${page}.intro`,
        ...sections.flatMap((s) => [`legal.${page}.${s}.title`, `legal.${page}.${s}.body`]),
      ]),
      // Rendered with <Trans i18nKey=…>, which the static scan above doesn't see.
      "login.terms",
    ];
    expect(dynamic.filter((k) => !available.has(k))).toEqual([]);
  });
});
