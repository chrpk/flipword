import { describe, expect, it } from "vitest";
import { parseAchievementId, reachedAchievements, streaks } from "../shared/achievements";
import { createScheduler, gradeCard, intervalParts, isLeechLapse, newSrsFields, previewDue, Rating, State } from "../shared/srs";
import type { PlayCard } from "../shared/types";
import { scoreIsTime } from "../shared/games";
import { guessColumns, looksLikeHeader, parseDelimited } from "../src/features/import/csv";
import { ankiFieldToText } from "../src/features/import/text";
import { burySiblings, dropNote, putBack, remainingCounts, requeue, takeNext } from "../src/features/study/session";
import { env } from "cloudflare:test";
import { timeZoneOffset } from "../shared/time";
import { getAuth } from "../worker/auth";
import { reviewTime } from "../worker/routes/study";
import { compareAnswer, judgeTyped } from "../src/features/study/typing";
import { gameRating } from "../worker/routes/games";
import { pickVoice } from "../src/lib/voices";
import { typedPoints } from "../src/features/games/scoring";
import {
  accentChars,
  buildQuiz,
  buildShowdown,
  dealMatch,
  findCloze,
  hintPattern,
  matchCards,
  nextStatement,
  pickDistractors,
  refillMatch,
  requeue as requeueTurn,
  turns,
  scrambleable,
  scrambleLayout,
  scrambleLetters,
  shuffle,
  streakMultiplier,
} from "../src/features/games/logic";

const NOW = Date.UTC(2026, 9, 28, 12);

function card(id: string, patch: Partial<PlayCard> = {}): PlayCard {
  return {
    confusedWith: [],
    id,
    deckId: "d",
    noteId: id,
    reverse: false,
    suspended: false,
    learnedAt: null,
    imageKey: null,
    flag: 0,
    front: id,
    back: id,
    example: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...newSrsFields(NOW),
    ...patch,
  };
}

describe("study queue", () => {
  it("shows due learning cards before the queue, then queued cards, then early learning cards", () => {
    const learningDue = card("l1", { state: State.Learning, due: NOW - 1 });
    const learningLater = card("l2", { state: State.Learning, due: NOW + 5 * 60_000 });
    const review = card("r", { state: State.Review, due: NOW - 1000 });

    let step = takeNext({ queue: [review], learning: [learningDue, learningLater] }, NOW);
    expect(step.card?.id).toBe("l1");
    step = takeNext(step.rest, NOW);
    expect(step.card?.id).toBe("r");
    step = takeNext(step.rest, NOW);
    expect(step.card?.id).toBe("l2");
    expect(takeNext(step.rest, NOW).card).toBeNull();
  });

  it("requeues graded learning cards due within the learn-ahead window", () => {
    const scheduler = createScheduler(0.9);
    const fresh = card("n");
    const again = { ...fresh, ...gradeCard(scheduler, fresh, Rating.Again, NOW).card };
    const easy = { ...fresh, ...gradeCard(scheduler, fresh, Rating.Easy, NOW).card };

    expect(requeue({ queue: [], learning: [] }, again, NOW).learning.map((c) => c.id)).toEqual(["n"]);
    expect(easy.state).toBe(State.Review);
    expect(requeue({ queue: [], learning: [] }, easy, NOW).learning).toEqual([]);
  });

  it("buries the other direction of an answered word", () => {
    const forward = card("w");
    const reverse = card("w-r", { noteId: "w", reverse: true });
    const other = card("o");
    expect(burySiblings({ queue: [reverse, other], learning: [] }, forward).queue.map((c) => c.id)).toEqual(["o"]);
    const learning = card("w-l", { noteId: "w", state: State.Learning });
    expect(dropNote({ queue: [reverse, other], learning: [learning] }, "w")).toEqual({ queue: [other], learning: [] });
  });

  it("counts the card on screen", () => {
    const counts = remainingCounts({ queue: [card("a")], learning: [card("b", { state: State.Relearning })] }, card("c", { state: State.Review }));
    expect(counts).toEqual({ newCount: 1, learningCount: 1, reviewCount: 1 });
  });
});

describe("scheduler", () => {
  it("previews the same due times that grading produces", () => {
    const scheduler = createScheduler(0.9);
    const reviewed = gradeCard(scheduler, card("x"), Rating.Good, NOW).card;
    const later = NOW + 3 * 86_400_000;
    const preview = previewDue(scheduler, { ...card("x"), ...reviewed }, later);
    for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
      expect(gradeCard(scheduler, { ...card("x"), ...reviewed }, grade, later).card.due).toBe(preview[grade]);
    }
  });

  it("formats intervals compactly", () => {
    expect(intervalParts(30_000)).toEqual({ value: 1, unit: "minute" });
    expect(intervalParts(10 * 60_000)).toEqual({ value: 10, unit: "minute" });
    expect(intervalParts(5 * 3600_000)).toEqual({ value: 5, unit: "hour" });
    expect(intervalParts(4 * 86_400_000)).toEqual({ value: 4, unit: "day" });
    expect(intervalParts(75 * 86_400_000)).toEqual({ value: 2.5, unit: "month" });
    expect(intervalParts(400 * 86_400_000)).toEqual({ value: 1.1, unit: "year" });
  });
});

describe("csv import", () => {
  it("detects delimiters, quotes and headers", () => {
    const table = parseDelimited('\uFEFFterm;definition\n"la casa; grande";the big house\n\nel gato;the cat\n');
    expect(table.rows).toEqual([
      ["term", "definition"],
      ["la casa; grande", "the big house"],
      ["el gato", "the cat"],
    ]);
    expect(looksLikeHeader(table.rows[0])).toBe(true);
    expect(guessColumns(table.rows[0], 2)).toEqual({ front: 0, back: 1, example: -1 });
  });

  it("parses Quizlet-style tab separated exports without a header", () => {
    const table = parseDelimited("hola\thello\nadiós\tgoodbye");
    expect(table.columnCount).toBe(2);
    expect(looksLikeHeader(table.rows[0])).toBe(false);
  });

  it("maps columns by header names", () => {
    expect(guessColumns(["Example", "Translation", "Word"], 3)).toEqual({ front: 2, back: 1, example: 0 });
  });
});

describe("anki field cleanup", () => {
  it("strips html, media and cloze markup", () => {
    expect(ankiFieldToText("<b>adiós</b>&nbsp;[sound:a.mp3]")).toBe("adiós");
    expect(ankiFieldToText("good<br>bye &amp; <i>farewell</i>")).toBe("good\nbye & farewell");
    expect(ankiFieldToText("El tren llega {{c1::tarde::late}}.")).toBe("El tren llega tarde.");
    expect(ankiFieldToText("<div>uno</div><div>dos</div>")).toBe("uno\ndos");
    expect(ankiFieldToText("&#233;t&#xE9;")).toBe("été");
  });
});

describe("typed answers", () => {
  it("ignores case and spacing but not accents", () => {
    expect(compareAnswer("  El  Tren ", "el tren").correct).toBe(true);
    expect(compareAnswer("adios", "adiós").correct).toBe(false);
  });

  it("marks right, wrong and missing characters", () => {
    expect(compareAnswer("adios", "adiós").parts).toEqual([
      { text: "adi", kind: "good" },
      { text: "ó", kind: "missed" },
      { text: "o", kind: "bad" },
      { text: "s", kind: "good" },
    ]);
    expect(compareAnswer("", "la casa").parts).toEqual([{ text: "la casa", kind: "missed" }]);
    expect(compareAnswer("hallo", "hola").parts.map((p) => p.kind)).toContain("bad");
  });
});

describe("leeches", () => {
  it("fire at the threshold and every half-threshold after, like Anki", () => {
    expect([7, 8, 9, 11, 12, 16].map(isLeechLapse)).toEqual([false, true, false, false, true, true]);
  });
});

/** Deterministic PRNG so game tests are repeatable. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("games", () => {
  const words = ["uno", "dos", "tres", "cuatro", "cinco", "seis"].map((w, i) => card(w, { front: w, back: `n${i + 1}` }));

  it("shuffles without losing items", () => {
    expect(shuffle(words, seeded(1)).map((c) => c.id).sort()).toEqual(words.map((c) => c.id).sort());
  });

  it("builds quiz questions with one right answer and distinct options", () => {
    const quiz = buildQuiz(words, 4, seeded(7));
    expect(quiz).toHaveLength(4);
    for (const q of quiz) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const expected = q.direction === "word" ? q.card.back : q.card.front;
      expect(q.options[q.answer]).toBe(expected);
      expect(q.prompt).toBe(q.direction === "word" ? q.card.front : q.card.back);
    }
  });

  it("uses fewer options when the deck is small", () => {
    expect(buildQuiz(words.slice(0, 2), 2, seeded(3))[0].options).toHaveLength(2);
  });

  it("builds match decks with unambiguous pairs", () => {
    const dupes = [...words, card("again", { front: "uno", back: "other" }), card("same", { front: "x", back: "n1" })];
    expect(matchCards(dupes, 10).map((c) => c.id)).toEqual(words.map((c) => c.id));
    expect(matchCards(dupes, 3)).toHaveLength(3);
  });

  it("refills the match board without leaving the newcomers in the cleared slots", () => {
    const [a, b, c, d, e] = words;
    let board = dealMatch([a, b, c, d], seeded(5));
    const ids = (xs: (PlayCard | null)[]) => xs.map((x) => x?.id).sort();
    expect(ids(board.words)).toEqual(ids(board.meanings));
    let movedMeaning = 0;
    for (let i = 0; i < 40; i++) {
      const before = dealMatch([a, b, c, d], seeded(i));
      const after = refillMatch(before, a, e, seeded(i + 100));
      expect(after.words[before.words.indexOf(a)]).toBe(e);
      expect(after.words.filter((x) => x === e)).toHaveLength(1);
      expect(after.meanings.filter((x) => x === e)).toHaveLength(1);
      expect(after.meanings).not.toContain(a);
      if (after.meanings.indexOf(e) !== before.meanings.indexOf(a)) movedMeaning++;
    }
    expect(movedMeaning).toBeGreaterThan(20);
    // With nothing left to deal, the pair's slots empty.
    board = refillMatch(board, b, undefined);
    expect(board.words).toContain(null);
    expect(board.meanings).toContain(null);
  });

  it("makes true and false statements and never repeats the previous word", () => {
    const random = seeded(11);
    let prev = null;
    let truths = 0;
    for (let i = 0; i < 200; i++) {
      const s = nextStatement(words, prev, random);
      expect(s.card.id).not.toBe(prev?.id);
      expect(s.isTrue).toBe(s.meaning === s.card.back);
      expect(s.meaning).toBe(s.meaningCard.back);
      if (s.isTrue) truths++;
      prev = s.card;
    }
    expect(truths).toBeGreaterThan(60);
    expect(truths).toBeLessThan(140);
  });

  it("picks random distractors for new words and look-alikes or past confusions for known ones", () => {
    const pool = ["gato", "gata", "pato", "perro", "casa", "mesa", "silla", "libro"].map((w, i) => card(w, { front: w, back: `m${i}` }));
    const fresh = pool[0];
    const known = { ...pool[0], state: State.Review, confusedWith: ["libro"] };
    const picks = (target: PlayCard, seed: number) => pickDistractors(target, pool, "word", 3, seeded(seed)).map((c) => c.front);
    // Known: the confused word first, then the closest spellings (equally close, in either order).
    for (let i = 0; i < 10; i++) {
      const [first, ...rest] = picks(known, i);
      expect(first).toBe("libro");
      expect(rest.sort()).toEqual(["gata", "pato"]);
    }
    // New: not always the look-alikes.
    const seen = new Set(Array.from({ length: 20 }, (_, i) => picks(fresh, i).join()));
    expect(seen.size).toBeGreaterThan(3);
    // Never the answer itself, a duplicate, or another word with the same meaning (a second right answer).
    const twin = card("twin", { front: "felino", back: "m0" });
    const dup = card("dup", { front: "GATO ", back: "zz" });
    for (let i = 0; i < 20; i++) {
      const ids = pickDistractors(known, [...pool, twin, dup], "word", 3, seeded(i)).map((c) => c.id);
      expect(ids).not.toContain("twin");
      expect(ids).not.toContain("dup");
      expect(ids).not.toContain("gato");
    }
    const q = buildQuiz([known, ...pool.slice(1)], 1, seeded(3))[0];
    expect(q.optionCards[q.answer].id).toBe("gato");
    expect(q.options).toEqual(q.optionCards.map((c) => (q.direction === "word" ? c.back : c.front)));
  });

  it("brings a missed question back a couple of places later, once per miss", () => {
    const queue = turns(["a", "b", "c", "d", "e"]);
    const back = requeueTurn(queue, 1, queue[1]);
    expect(back.map((t) => `${t.item}${t.attempt}`)).toEqual(["a1", "b1", "c1", "d1", "b2", "e1"]);
    // Near the end it simply goes last.
    expect(requeueTurn(queue, 4, queue[4]).map((t) => t.item)).toEqual(["a", "b", "c", "d", "e", "e"]);
  });

  it("finds a card's word in its example sentence", () => {
    expect(findCloze("La luna brilla esta noche.", "la luna", "es")).toMatchObject({
      before: "",
      gap: "La luna",
      after: " brilla esta noche.",
      // Leaving out the article is "almost".
      almost: ["luna"],
    });
    // Without its article.
    expect(findCloze("Hoy hace sol.", "el sol", "es")).toMatchObject({ before: "Hoy hace ", gap: "sol", after: "." });
    // Whole words only: "sol" isn't in "solo".
    expect(findCloze("Estoy solo.", "el sol", "es")).toBeNull();
    // Notes in brackets are ignored.
    expect(findCloze("Me gusta correr.", "correr (v.)", "es")?.gap).toBe("correr");
    // An inflected form, with the dictionary form as "almost".
    expect(findCloze("Nosotros hablamos mucho.", "hablar", "es")).toMatchObject({ gap: "hablamos", accepted: ["hablamos"], almost: ["hablar"] });
    // Short words don't match loosely: "pero" is not "perro".
    expect(findCloze("Pero no hoy.", "perro", "es")).toBeNull();
    // Languages without spaces match inside the sentence.
    expect(findCloze("私は猫が好きです。", "猫", "ja")).toMatchObject({ before: "私は", gap: "猫", after: "が好きです。" });
    expect(findCloze("", "猫", "ja")).toBeNull();
    // Composed and decomposed accents match.
    expect(findCloze("Un café, por favor.", "cafe\u0301", "es")?.gap).toBe("café");
  });

  it("builds graded hints that keep the word's shape", () => {
    expect(hintPattern("la casa", 0)).toBe("");
    expect(hintPattern("la casa", 1)).toBe("_ _   _ _ _ _");
    expect(hintPattern("la casa", 2)).toBe("l _   _ _ _ _");
    expect(hintPattern("la casa", 3)).toBe("l a   c _ _ _");
    expect(hintPattern("¿qué?", 2)).toBe("¿ q _ _ ?");
  });

  it("offers an accent strip only for Latin-script decks with special letters", () => {
    expect(accentChars(["café", "niño", "niña", "año", "casa"])).toEqual(["ñ", "é"]);
    expect(accentChars(["casa", "perro"])).toEqual([]);
    expect(accentChars(["привет", "дом"])).toEqual([]);
  });

  it("plans a showdown phase by phase, falling back to a pick for words that can't be tiled", () => {
    const plan = buildShowdown([...words.slice(0, 3), card("a", { front: "a" })], 4, seeded(9));
    expect(plan.map((t) => t.phase)).toEqual(["pick", "pick", "pick", "pick", "tiles", "tiles", "tiles", "tiles", "typed", "typed", "typed", "typed"]);
    expect(plan.filter((t) => t.fallback).map((t) => [t.card.id, t.phase])).toEqual([["a", "tiles"]]);
  });

  it("judges typed answers with lenient accents and near forms", () => {
    expect(judgeTyped("cafe\u0301", ["café"]).correct).toBe(true);
    expect(compareAnswer("cafe\u0301", "café").correct).toBe(true);
    expect(judgeTyped("cafe", ["café"])).toMatchObject({ correct: false, nearMiss: false });
    expect(judgeTyped("cafe", ["café"], { lenientAccents: true })).toMatchObject({ correct: true, nearMiss: true });
    expect(judgeTyped("hablar", ["hablamos"], { almost: ["hablar"] })).toMatchObject({ correct: true, nearMiss: true });
    expect(judgeTyped("Hablamos", ["hablamos"], { almost: ["hablar"] })).toMatchObject({ correct: true, nearMiss: false });
  });

  it("scores and rates typed answers by how much help they needed", () => {
    expect(typedPoints({ correct: true, hints: 0, nearMiss: false })).toBe(10);
    expect(typedPoints({ correct: true, hints: 2, nearMiss: true })).toBe(2);
    expect(typedPoints({ correct: true, hints: 3, nearMiss: true })).toBe(1);
    expect(typedPoints({ correct: false, hints: 0, nearMiss: false })).toBe(0);
    expect(gameRating({ correct: false, hints: 0, nearMiss: false })).toBe(Rating.Again);
    expect(gameRating({ correct: true, hints: 1, nearMiss: false })).toBe(Rating.Hard);
    expect(gameRating({ correct: true, hints: 0, nearMiss: true })).toBe(Rating.Hard);
    expect(gameRating({ correct: true, hints: 0, nearMiss: false })).toBe(Rating.Good);
    expect(scoreIsTime("match", "standard")).toBe(true);
    expect(scoreIsTime("match", "relaxed")).toBe(false);
    expect(scoreIsTime("truefalse", "standard")).toBe(false);
  });

  it("asks words with photos from the photo, and words by sound only when audio is on", () => {
    const withPhoto = words.map((w, i) => (i % 2 ? { ...w, imageKey: `k${i}` } : w));
    const quiz = Array.from({ length: 20 }, (_, i) => buildQuiz(withPhoto, 6, seeded(i), { audio: true })).flat();
    const photo = quiz.filter((q) => q.cue === "photo");
    expect(photo.length).toBeGreaterThan(0);
    // A photo asks for the word.
    for (const q of photo) expect([q.card.imageKey !== null, q.direction]).toEqual([true, "meaning"]);
    // A sound asks for the meaning.
    for (const q of quiz.filter((q) => q.cue === "audio")) expect(q.direction).toBe("word");
    expect(quiz.some((q) => q.cue === "audio")).toBe(true);
    expect(buildQuiz(words, 6, seeded(1)).every((q) => q.cue === "text")).toBe(true);
  });

  it("matches speech voices however the platform writes the language", () => {
    const voice = (lang: string, localService = true) => ({ lang, localService });
    const voices = [voice("en-US"), voice("es_MX", false), voice("es_ES"), voice("spa-ES-f000")];
    expect(pickVoice(voices, "es-ES")?.lang).toBe("es_ES");
    expect(pickVoice(voices, "es")?.lang).toBe("es_ES");
    expect(pickVoice([voice("en-GB"), voice("spa-US-f000")], "es")?.lang).toBe("spa-US-f000");
    expect(pickVoice([voice("en-GB")], "fr")).toBeUndefined();
  });

  it("multiplies streaks up to x4", () => {
    expect([0, 4, 5, 9, 10, 15, 40].map(streakMultiplier)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  it("scrambles letters into a different order", () => {
    for (let i = 0; i < 20; i++) {
      const out = scrambleLetters("el tren", seeded(i));
      expect([...out].sort().join("")).toBe([..."eltren"].sort().join(""));
      expect(out.join("")).not.toBe("eltren");
    }
    expect(scrambleLetters("aa", seeded(1))).toEqual(["a", "a"]);
    expect(scrambleable(card("a", { front: "a" }))).toBe(false);
    expect(scrambleable(card("ok", { front: "la casa" }))).toBe(true);
    // Punctuation and spaces stay in place; only letters become tiles.
    expect(scrambleLetters("el libro, grande", seeded(2))).not.toContain(",");
    expect(scrambleLayout("el libro, grande")).toEqual([
      [{ slot: 0 }, { slot: 1 }],
      [{ slot: 2 }, { slot: 3 }, { slot: 4 }, { slot: 5 }, { slot: 6 }, { fixed: "," }],
      [{ slot: 7 }, { slot: 8 }, { slot: 9 }, { slot: 10 }, { slot: 11 }, { slot: 12 }],
    ]);
  });
});

describe("review fixes", () => {
  it("puts a learning card back into the learning queue on undo (#7)", () => {
    const restored = card("prev");
    const learningOnScreen = card("l", { state: State.Learning, due: NOW + 60_000 });
    const other = card("l2", { state: State.Learning, due: NOW + 120_000 });
    const queued = card("q");
    const back = putBack({ queue: [queued], learning: [other] }, learningOnScreen, restored);
    expect(back.queue.map((c) => c.id)).toEqual(["q"]);
    expect(back.learning.map((c) => c.id)).toEqual(["l", "l2"]);
    const fresh = card("n");
    expect(putBack({ queue: [queued], learning: [] }, fresh, restored).queue.map((c) => c.id)).toEqual(["n", "q"]);
    // The restored card is never left in the learning queue.
    expect(putBack({ queue: [], learning: [restored] }, null, restored).learning).toEqual([]);
  });

  it("judges clock skew by send time, not reveal time (#9)", () => {
    const now = NOW;
    const min = 60_000;
    expect(reviewTime({ reviewedAt: now - 15 * min, sentAt: now }, now)).toBe(now - 15 * min);
    // Client clock two hours fast: shifted back into server time.
    expect(reviewTime({ reviewedAt: now + 119 * min, sentAt: now + 120 * min }, now)).toBe(now - min);
    // Older clients without sentAt keep the previous guard.
    expect(reviewTime({ reviewedAt: now - 15 * min }, now)).toBe(now);
    expect(reviewTime({ reviewedAt: now - 2 * min }, now)).toBe(now - 2 * min);
    // Never more than a day old.
    expect(reviewTime({ reviewedAt: now - 3 * 86_400_000, sentAt: now }, now)).toBe(now - 86_400_000);
  });

  it("computes time zone offsets with daylight saving (#8)", () => {
    expect(timeZoneOffset("UTC", NOW)).toBe(0);
    expect(timeZoneOffset("Asia/Kolkata", NOW)).toBe(-330);
    expect(timeZoneOffset("America/New_York", Date.UTC(2026, 0, 15))).toBe(300);
    expect(timeZoneOffset("America/New_York", Date.UTC(2026, 6, 15))).toBe(240);
    expect(timeZoneOffset("Not/AZone", NOW)).toBeNull();
  });

  it("only auto-links accounts from providers that verify emails, with one auth instance per env (#5, #10)", () => {
    const auth = getAuth(env);
    expect(auth.options.account?.accountLinking?.trustedProviders).toEqual(["google"]);
    expect(getAuth(env)).toBe(auth);
  });
});

describe("csv round trip", () => {
  it("strips the formula-guard apostrophe on import (#6)", () => {
    const table = parseDelimited(`front,back\n"'=HYPERLINK(""x"")",'+1\n'-ing,suffix\nit's,es`);
    expect(table.rows.slice(1)).toEqual([
      ['=HYPERLINK("x")', "+1"],
      ["-ing", "suffix"],
      ["it's", "es"],
    ]);
  });
});

describe("achievements", () => {
  it("measures current and longest streaks", () => {
    expect(streaks([], 10)).toEqual({ current: 0, longest: 0 });
    expect(streaks([10, 9, 8, 5, 4, 3, 2], 10)).toEqual({ current: 3, longest: 4 });
    // Today isn't over: a run ending yesterday is still current.
    expect(streaks([9, 8], 10)).toEqual({ current: 2, longest: 2 });
    expect(streaks([8, 7], 10)).toEqual({ current: 0, longest: 2 });
  });

  it("lists every tier reached", () => {
    expect(reachedAchievements({ streak: 7, words: 99, reviews: 0, games: 1 })).toEqual([
      "streak-3",
      "streak-7",
      "words-10",
      "words-50",
      "games-1",
    ]);
  });

  it("parses only known ids", () => {
    expect(parseAchievementId("words-500")).toEqual({ track: "words", goal: 500 });
    expect(parseAchievementId("words-499")).toBeNull();
    expect(parseAchievementId("constructor-1")).toBeNull();
    expect(parseAchievementId("streak")).toBeNull();
  });
});
