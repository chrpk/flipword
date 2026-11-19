export type DiffKind = "good" | "bad" | "missed";

export interface DiffPart {
  text: string;
  kind: DiffKind;
}

export interface TypedResult {
  correct: boolean;
  parts: DiffPart[];
}

/** One Unicode form (so a precomposed "é" equals "e" + combining accent), no outer or repeated spaces. */
const normalize = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");

/** The text without accents and other combining marks: "café" → "cafe". */
export const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");

/**
 * Compares a typed answer with the expected one, like Anki's "type in the answer": typed characters that match are
 * "good", extra or wrong ones are "bad", and expected characters the learner left out are "missed".
 * Case and extra whitespace are ignored; accents count, since they are part of spelling a word correctly.
 */
export function compareAnswer(typed: string, expected: string, locale = "en"): TypedResult {
  const a = [...normalize(typed)];
  const b = [...normalize(expected)];
  const al = a.map((ch) => ch.toLocaleLowerCase(locale));
  const bl = b.map((ch) => ch.toLocaleLowerCase(locale));

  // Longest common subsequence table.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = al[i] === bl[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (text: string, kind: DiffKind) => {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && al[i] === bl[j]) {
      push(a[i], "good");
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      push(b[j], "missed");
      j++;
    } else {
      push(a[i], "bad");
      i++;
    }
  }

  return { correct: al.join("") === bl.join(""), parts };
}

export interface Judged extends TypedResult {
  /** Right, but only "almost": a slipped accent (when lenient), or an accepted near form. */
  nearMiss: boolean;
}

/**
 * Judges a typed game answer against every accepted spelling. With `lenientAccents`, an answer that is right except
 * for accents counts as "almost"; so does any of the `almost` forms. The diff is always against the first accepted
 * spelling, which is what the learner is shown.
 */
export function judgeTyped(
  typed: string,
  accepted: readonly string[],
  { almost = [], lenientAccents = false, locale = "en" }: { almost?: readonly string[]; lenientAccents?: boolean; locale?: string } = {},
): Judged {
  const shown = compareAnswer(typed, accepted[0], locale);
  const exact = (expected: string) => compareAnswer(typed, expected, locale).correct;
  const loose = (expected: string) => compareAnswer(stripAccents(typed), stripAccents(expected), locale).correct;
  if (accepted.some(exact)) return { ...shown, correct: true, nearMiss: false };
  if ((lenientAccents && accepted.some(loose)) || almost.some(exact) || (lenientAccents && almost.some(loose))) {
    return { ...shown, correct: true, nearMiss: true };
  }
  return { ...shown, correct: false, nearMiss: false };
}
