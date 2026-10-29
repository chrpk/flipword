const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Converts an Anki field (HTML with media/cloze markup) into plain text. */
export function ankiFieldToText(html: string) {
  return decodeEntities(
    html
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function cleanCell(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\u00a0/g, " ").trim();
  // flipword's CSV export prefixes would-be formulas with an apostrophe; undo that so exports re-import unchanged.
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}
