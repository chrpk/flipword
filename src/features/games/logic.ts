import { REQUEUE_GAP } from "../../../shared/games";
import { State } from "../../../shared/srs";
import type { CardDto, PlayCard } from "../../../shared/types";

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

/** What the question shows: the text, the word's photo (asking for the word), or only its sound (asking the meaning). */
export type QuizCue = "text" | "photo" | "audio";

export interface QuizQuestion {
  card: PlayCard;
  direction: Direction;
  cue: QuizCue;
  prompt: string;
  options: string[];
  /** The card each option's text comes from, to log which word was picked instead. */
  optionCards: PlayCard[];
  answer: number;
}

export const field = (card: CardDto, side: Direction) => (side === "word" ? card.front : card.back);
export const other = (side: Direction): Direction => (side === "word" ? "meaning" : "word");
/** Comparable form of a card's text: one Unicode form, no case, no outer or repeated spaces. */
export const key = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** A word the learner already knows: graduated to review, or marked learned. */
export function isMature(card: CardDto) {
  return card.learnedAt !== null || card.state === State.Review;
}

/** Edit distance, for "looks alike" distractors. */
export function editDistance(a: string, b: string) {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** 1 for identical text, 0 for nothing in common. */
export function similarity(a: string, b: string) {
  const ka = key(a);
  const kb = key(b);
  const longest = Math.max([...ka].length, [...kb].length);
  return longest === 0 ? 1 : 1 - editDistance(ka, kb) / longest;
}

/**
 * Wrong options for a multiple-choice question whose answer is `target`'s `side`. A new word gets random ones (close
 * look-alikes interfere while a word is still being learned); a known word gets the hardest ones: words the learner
 * picked instead before, then look-alikes. Options never repeat the answer's text, and a word that shares the
 * question's text is left out, since it would be a second right answer.
 */
export function pickDistractors(
  target: PlayCard,
  pool: readonly PlayCard[],
  side: Direction,
  count: number,
  random: Random = Math.random,
): PlayCard[] {
  const answer = key(field(target, side));
  const question = key(field(target, other(side)));
  const seen = new Set([answer]);
  const candidates: PlayCard[] = [];
  for (const c of shuffle(pool, random)) {
    const text = key(field(c, side));
    if (c.id === target.id || seen.has(text) || key(field(c, other(side))) === question) continue;
    seen.add(text);
    candidates.push(c);
  }
  if (!isMature(target)) return candidates.slice(0, count);
  const confused = new Set(target.confusedWith ?? []);
  const hardness = (c: PlayCard) => (confused.has(c.id) ? 2 : 0) + similarity(field(c, side), field(target, side)) + random() * 0.2;
  return candidates
    .map((c) => ({ c, h: hardness(c) }))
    .sort((a, b) => b.h - a.h)
    .slice(0, count)
    .map((x) => x.c);
}

/** A multiple-choice question about `card`, with up to three wrong options from `pool`. */
export function buildQuestion(
  card: PlayCard,
  pool: readonly PlayCard[],
  direction: Direction,
  random: Random = Math.random,
  cue: QuizCue = "text",
): QuizQuestion {
  const answerSide = other(direction);
  const optionCards = shuffle([card, ...pickDistractors(card, pool, answerSide, 3, random)], random);
  return {
    card,
    direction,
    cue,
    prompt: field(card, direction),
    options: optionCards.map((c) => field(c, answerSide)),
    optionCards,
    answer: optionCards.indexOf(card),
  };
}

/**
 * Multiple-choice questions in both directions; distractors come from the other cards' matching side. A word with a
 * photo is sometimes asked from the photo, and with `audio` a word is sometimes only heard (pick its meaning).
 */
export function buildQuiz(cards: PlayCard[], rounds: number, random: Random = Math.random, { audio = false } = {}): QuizQuestion[] {
  return cards.slice(0, rounds).map((card) => {
    const r = random();
    if (card.imageKey && r < 0.3) return buildQuestion(card, cards, "meaning", random, "photo");
    if (audio && r < 0.5) return buildQuestion(card, cards, "word", random, "audio");
    return buildQuestion(card, cards, random() < 0.5 ? "word" : "meaning", random);
  });
}

/** One question in a game's queue; a missed one comes back later with the next attempt number. */
export interface Turn<T> {
  item: T;
  attempt: number;
}

export const turns = <T>(items: readonly T[]): Turn<T>[] => items.map((item) => ({ item, attempt: 1 }));

/**
 * Puts a missed question back `gap` places after the current one, so it comes back after a short break instead of
 * straight away (spaced, not massed, repetition).
 */
export function requeue<T>(queue: readonly Turn<T>[], index: number, turn: Turn<T>, gap = REQUEUE_GAP): Turn<T>[] {
  const at = Math.min(queue.length, index + 1 + gap);
  const back = { item: turn.item, attempt: turn.attempt + 1 };
  return [...queue.slice(0, at), back, ...queue.slice(at)];
}

export interface Statement {
  card: CardDto;
  meaning: string;
  /** The card the meaning belongs to (the same card when the statement is true). */
  meaningCard: CardDto;
  isTrue: boolean;
}

/** A word paired with its own meaning (half the time) or another card's meaning. */
export function nextStatement(cards: CardDto[], previous: CardDto | null, random: Random = Math.random): Statement {
  const pool = cards.length > 1 && previous ? cards.filter((c) => c.id !== previous.id) : cards;
  const card = pool[Math.floor(random() * pool.length)];
  const others = cards.filter((c) => key(c.back) !== key(card.back));
  if (others.length === 0 || random() < 0.5) return { card, meaning: card.back, meaningCard: card, isTrue: true };
  const meaningCard = others[Math.floor(random() * others.length)];
  return { card, meaning: meaningCard.back, meaningCard, isTrue: false };
}

/** True-or-false points: 10 per answer, ×2 after a streak of 5, ×3 after 10, up to ×4. */
export function streakMultiplier(streak: number) {
  return Math.min(4, 1 + Math.floor(streak / 5));
}

/** Cards for a Match game: those whose word or meaning repeats another card's are dropped to keep pairs unambiguous. */
export function matchCards<T extends CardDto>(cards: readonly T[], pairs: number): T[] {
  const words = new Set<string>();
  const meanings = new Set<string>();
  const chosen: T[] = [];
  for (const c of cards) {
    if (words.has(key(c.front)) || meanings.has(key(c.back))) continue;
    words.add(key(c.front));
    meanings.add(key(c.back));
    chosen.push(c);
    if (chosen.length === pairs) break;
  }
  return chosen;
}

/** The Match board: a column of words and a column of meanings, in different orders. `null` is an emptied slot. */
export interface MatchBoard<T> {
  words: (T | null)[];
  meanings: (T | null)[];
}

export function dealMatch<T>(cards: readonly T[], random: Random = Math.random): MatchBoard<T> {
  return { words: shuffle(cards, random), meanings: shuffle(cards, random) };
}

/**
 * Replaces a matched pair with the next card from the queue. The new word takes the matched word's slot; its meaning
 * swaps into a random meaning slot, so the two newcomers aren't simply the two slots that were just cleared, and the
 * last pairs on the board aren't free by elimination while the queue still has cards.
 */
export function refillMatch<T>(board: MatchBoard<T>, matched: T, next: T | undefined, random: Random = Math.random): MatchBoard<T> {
  const words = [...board.words];
  const meanings = [...board.meanings];
  const w = words.indexOf(matched);
  const m = meanings.indexOf(matched);
  words[w] = next ?? null;
  meanings[m] = null;
  if (next === undefined) return { words, meanings };
  const filled = meanings.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0);
  const swap = [m, ...filled][Math.floor(random() * (filled.length + 1))];
  meanings[m] = meanings[swap];
  meanings[swap] = next;
  return { words, meanings };
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

const LETTER = /[\p{L}\p{M}\p{N}]/u;

/** Languages written without spaces between words: a word is found anywhere in the sentence. */
const SPACELESS = new Set(["ja", "zh", "th", "lo", "km", "my", "bo"]);
const baseLang = (lang: string) => lang.toLowerCase().split(/[-_]/)[0];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A sentence with one word taken out. */
export interface Cloze {
  before: string;
  /** The text taken out, as the sentence spells it. */
  gap: string;
  after: string;
  /** Typed answers that are fully right. */
  accepted: string[];
  /** Typed answers that are "almost": the dictionary form where the sentence needs an inflected one. */
  almost: string[];
}

/** The front without notes in brackets: "correr (v.)" → "correr". */
const clozeWord = (front: string) => front.replace(/\s*[([].*?[)\]]/g, "").trim();

/**
 * Finds the card's word in its example sentence. Tries, in order: the whole front; the front without a short leading
 * article or particle ("la luna" → "luna", "to run" → "run"); then, for a single word in a language with spaces,
 * the sentence word that shares a long beginning with it ("hablar" → "hablamos"). Returns null when nothing matches
 * confidently, so the game skips the card rather than blanking the wrong word.
 */
export function findCloze(sentence: string, front: string, lang: string): Cloze | null {
  const text = sentence.normalize("NFC").trim();
  const word = clozeWord(front.normalize("NFC"));
  if (!text || !word) return null;
  const spaceless = SPACELESS.has(baseLang(lang));
  const bound = spaceless ? ["", ""] : ["(?<![\\p{L}\\p{M}\\p{N}])", "(?![\\p{L}\\p{M}\\p{N}])"];

  const parts = word.split(/\s+/);
  const candidates = [word];
  if (parts.length > 1 && [...parts[0]].length <= 3) candidates.push(parts.slice(1).join(" "));

  for (const candidate of candidates) {
    const pattern = new RegExp(bound[0] + escapeRegExp(candidate).replace(/\s+/g, "\\s+") + bound[1], "iu");
    const m = pattern.exec(text);
    if (!m) continue;
    const gap = m[0];
    const accepted = [...new Set([gap, candidate, word])];
    // The gap includes the article: the word without it is "almost".
    const almost = candidate === word && candidates.length > 1 ? [candidates[1]] : [];
    return { before: text.slice(0, m.index), gap, after: text.slice(m.index + gap.length), accepted, almost };
  }

  // Inflected forms: only for a single word of 4+ letters, and only a long shared beginning.
  const single = candidates.at(-1)!;
  if (spaceless || /\s/.test(single) || [...single].length < 4) return null;
  const target = [...single.toLocaleLowerCase(lang)];
  let best: { index: number; token: string; shared: number } | null = null;
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const token = [...m[0].toLocaleLowerCase(lang)];
    if (Math.abs(token.length - target.length) > 4) continue;
    let shared = 0;
    while (shared < token.length && shared < target.length && token[shared] === target[shared]) shared++;
    if (shared < 4 || shared < Math.ceil(target.length * 0.6)) continue;
    if (!best || shared > best.shared) best = { index: m.index, token: m[0], shared };
  }
  if (!best) return null;
  return {
    before: text.slice(0, best.index),
    gap: best.token,
    after: text.slice(best.index + best.token.length),
    accepted: [best.token],
    almost: [single],
  };
}

/**
 * A graded hint for a word: level 1 shows how many letters it has, level 2 adds the first letter, level 3 the first
 * half. Spaces and punctuation always show, so the word keeps its shape.
 */
export function hintPattern(word: string, level: number): string {
  if (level <= 0) return "";
  const chars = [...word.trim()];
  const total = chars.filter((ch) => LETTER.test(ch)).length;
  const shown = level === 1 ? 0 : level === 2 ? 1 : Math.ceil(total / 2);
  let n = 0;
  return chars
    .map((ch) => {
      if (/\s/.test(ch)) return " ";
      if (!LETTER.test(ch)) return ch;
      return n++ < shown ? ch : "_";
    })
    .join(" ");
}

/** How many hint levels hintPattern has (letter count, first letter, first half). */
export const HINT_LEVELS = 3;

/**
 * Special letters for an on-screen accent strip: the non-ASCII letters in the deck's words, most frequent first.
 * Empty for a deck written mostly outside the Latin alphabet, whose learners type with a keyboard for that script.
 */
export function accentChars(words: readonly string[], max = 12): string[] {
  const counts = new Map<string, number>();
  let letters = 0;
  for (const word of words) {
    for (const ch of word.normalize("NFC").toLocaleLowerCase()) {
      if (!/\p{L}/u.test(ch)) continue;
      letters++;
      if (/[a-z]/.test(ch)) continue;
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  const special = [...counts.values()].reduce((a, b) => a + b, 0);
  if (letters === 0 || special / letters > 0.3) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([ch]) => ch);
}

/** Showdown's three phases: pick the meaning, build the word from tiles, type the word. */
export type ShowdownPhase = "pick" | "tiles" | "typed";
export const SHOWDOWN_PHASES: ShowdownPhase[] = ["pick", "tiles", "typed"];

export interface ShowdownTurn {
  card: PlayCard;
  phase: ShowdownPhase;
  /** Tiles phase for a word that can't be scrambled (one letter, or very long): pick the word for its meaning. */
  fallback: boolean;
}

/** Every word in every phase, phase by phase, each phase in its own order. */
export function buildShowdown(cards: readonly PlayCard[], words: number, random: Random = Math.random): ShowdownTurn[] {
  const chosen = cards.slice(0, words);
  return SHOWDOWN_PHASES.flatMap((phase) =>
    shuffle(chosen, random).map((card) => ({ card, phase, fallback: phase === "tiles" && !scrambleable(card) })),
  );
}

export interface GapRound {
  card: PlayCard;
  cloze: Cloze;
}

/** Cards whose example sentence contains their word, with the word found. */
export function gapRounds(cards: readonly PlayCard[], lang: string): GapRound[] {
  return cards.flatMap((card) => {
    const cloze = findCloze(card.example, card.front, lang);
    return cloze ? [{ card, cloze }] : [];
  });
}
