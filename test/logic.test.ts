import { describe, expect, it } from "vitest";
import { parseAchievementId, reachedAchievements, streaks } from "../shared/achievements";
import { createScheduler, gradeCard, intervalParts, isLeechLapse, newSrsFields, previewDue, Rating, State } from "../shared/srs";
import type { CardDto } from "../shared/types";
import { guessColumns, looksLikeHeader, parseDelimited } from "../src/features/import/csv";
import { ankiFieldToText } from "../src/features/import/text";
import { burySiblings, dropNote, putBack, remainingCounts, requeue, takeNext } from "../src/features/study/session";
import { env } from "cloudflare:test";
import { timeZoneOffset } from "../shared/time";
import { getAuth } from "../worker/auth";
import { reviewTime } from "../worker/routes/study";
import { compareAnswer } from "../src/features/study/typing";
import {
  buildMatch,
  buildQuiz,
  nextStatement,
  scrambleable,
  scrambleLayout,
  scrambleLetters,
  shuffle,
  streakMultiplier,
} from "../src/features/games/logic";

const NOW = Date.UTC(2026, 9, 28, 12);

function card(id: string, patch: Partial<CardDto> = {}): CardDto {
  return {
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

  it("builds match boards with unambiguous pairs", () => {
    const dupes = [...words, card("again", { front: "uno", back: "other" }), card("same", { front: "x", back: "n1" })];
    const tiles = buildMatch(dupes, 6, seeded(5));
    expect(tiles).toHaveLength(12);
    const fronts = tiles.filter((t) => t.side === "word").map((t) => t.text);
    expect(new Set(fronts).size).toBe(fronts.length);
    for (const t of tiles) expect(tiles.filter((o) => o.cardId === t.cardId)).toHaveLength(2);
  });

  it("makes true and false statements and never repeats the previous word", () => {
    const random = seeded(11);
    let prev = null;
    let truths = 0;
    for (let i = 0; i < 200; i++) {
      const s = nextStatement(words, prev, random);
      expect(s.card.id).not.toBe(prev?.id);
      expect(s.isTrue).toBe(s.meaning === s.card.back);
      if (s.isTrue) truths++;
      prev = s.card;
    }
    expect(truths).toBeGreaterThan(60);
    expect(truths).toBeLessThan(140);
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
