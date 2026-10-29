export type DiffKind = "good" | "bad" | "missed";

export interface DiffPart {
  text: string;
  kind: DiffKind;
}

export interface TypedResult {
  correct: boolean;
  parts: DiffPart[];
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

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
