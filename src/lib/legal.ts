/** Sections of the privacy policy and terms; each has `title` and `body` strings under `legal.<page>.<section>`. */
export const LEGAL_SECTIONS = {
  privacy: [
    "who",
    "data",
    "purposes",
    "sharing",
    "publicDecks",
    "cookies",
    "retention",
    "rights",
    "deletion",
    "security",
    "children",
    "changes",
  ],
  terms: ["account", "content", "publicDecks", "rules", "reports", "availability", "liability", "ending", "changes"],
} as const;

export type LegalPageId = keyof typeof LEGAL_SECTIONS;

/** Bump when the text of either page changes. */
export const LEGAL_UPDATED = Date.UTC(2026, 9, 28, 12);
