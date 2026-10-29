import type { CardDto } from "../../../shared/types";

export type Random = () => number;

export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "word" asks for the meaning; "meaning" asks for the word. */
export type Direction = "word" | "meaning";

export interface QuizQuestion {
  card: CardDto;
  direction: Direction;
  prompt: string;
  options: string[];
  answer: number;
}

const field = (card: CardDto, side: Direction) => (side === "word" ? card.front : card.back);
const other = (side: Direction): Direction => (side === "word" ? "meaning" : "word");
const key = (s: string) => s.trim().toLowerCase();

/** Multiple-choice questions in both directions; distractors come from the other cards' matching side. */
export function buildQuiz(cards: CardDto[], rounds: number, random: Random = Math.random): QuizQuestion[] {
  return cards.slice(0, rounds).map((card) => {
    const direction: Direction = random() < 0.5 ? "word" : "meaning";
    const answerSide = other(direction);
    const correct = field(card, answerSide);
    const seen = new Set([key(correct)]);
    const distractors: string[] = [];
    for (const c of shuffle(cards, random)) {
      const text = field(c, answerSide);
      if (seen.has(key(text))) continue;
      seen.add(key(text));
      distractors.push(text);
      if (distractors.length === 3) break;
    }
    const options = shuffle([correct, ...distractors], random);
    return { card, direction, prompt: field(card, direction), options, answer: options.indexOf(correct) };
  });
}

export interface Statement {
  card: CardDto;
  meaning: string;
  isTrue: boolean;
}

/** A word paired with its own meaning (half the time) or another card's meaning. */
export function nextStatement(cards: CardDto[], previous: CardDto | null, random: Random = Math.random): Statement {
  const pool = cards.length > 1 && previous ? cards.filter((c) => c.id !== previous.id) : cards;
  const card = pool[Math.floor(random() * pool.length)];
  const others = cards.filter((c) => key(c.back) !== key(card.back));
  if (others.length === 0 || random() < 0.5) return { card, meaning: card.back, isTrue: true };
  return { card, meaning: others[Math.floor(random() * others.length)].back, isTrue: false };
}

/** True-or-false points: 10 per answer, ×2 after a streak of 5, ×3 after 10, up to ×4. */
export function streakMultiplier(streak: number) {
  return Math.min(4, 1 + Math.floor(streak / 5));
}

export interface MatchTile {
  id: string;
  cardId: string;
  side: Direction;
  text: string;
}

/** Two tiles per card, shuffled. Cards whose word or meaning repeats another card's are dropped to keep pairs unambiguous. */
export function buildMatch(cards: CardDto[], pairs: number, random: Random = Math.random): MatchTile[] {
  const words = new Set<string>();
  const meanings = new Set<string>();
  const chosen: CardDto[] = [];
  for (const c of cards) {
    if (words.has(key(c.front)) || meanings.has(key(c.back))) continue;
    words.add(key(c.front));
    meanings.add(key(c.back));
    chosen.push(c);
    if (chosen.length === pairs) break;
  }
  return shuffle(
    chosen.flatMap((c) => [
      { id: `${c.id}:word`, cardId: c.id, side: "word" as const, text: c.front },
      { id: `${c.id}:meaning`, cardId: c.id, side: "meaning" as const, text: c.back },
    ]),
    random,
  );
}

const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/** The letters (and digits) of a word; spaces and punctuation are not part of the puzzle. */
export function letters(word: string) {
  return [...word.trim()].filter(isLetter);
}

/**
 * The word split into its space-separated parts, each a list of letter slots (by index into `letters`) and fixed
 * characters such as punctuation, so the board keeps the word's shape.
 */
export function scrambleLayout(word: string): ({ slot: number } | { fixed: string })[][] {
  let n = 0;
  return word
    .trim()
    .split(/\s+/)
    .map((part) => [...part].map((ch) => (isLetter(ch) ? { slot: n++ } : { fixed: ch })));
}

/** Words that make a sensible scramble: 2–24 letters. */
export function scrambleable(card: CardDto) {
  const count = letters(card.front).length;
  return count >= 2 && count <= 24;
}

/** Shuffled letters of a word, different from the original order whenever possible. */
export function scrambleLetters(word: string, random: Random = Math.random): string[] {
  const chars = letters(word);
  const distinct = new Set(chars.map((l) => l.toLowerCase())).size > 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = shuffle(chars, random);
    if (!distinct || out.join("").toLowerCase() !== chars.join("").toLowerCase()) return out;
  }
  return [...chars].reverse();
}
