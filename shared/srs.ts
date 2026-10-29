import {
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";

export { Rating, State, type Grade };

/** Learning cards due within this window are shown again in the same session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** Anki's default: a card forgotten this many times is a leech and gets suspended. */
export const LEECH_THRESHOLD = 8;

/** Like Anki: a leech at the threshold, then again every half-threshold lapses (8, 12, 16, …). */
export function isLeechLapse(lapses: number) {
  const step = Math.max(1, Math.ceil(LEECH_THRESHOLD / 2));
  return lapses >= LEECH_THRESHOLD && (lapses - LEECH_THRESHOLD) % step === 0;
}

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

/** Scheduling fields stored on every card row. Times are epoch milliseconds. */
export interface SrsFields {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
}

/** Card state before a review, as stored in review_log. */
export interface SrsLogFields {
  rating: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  review: number;
}

export function newSrsFields(now: number): SrsFields {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReview: null,
  };
}

/** Share of answers FSRS aims to have remembered, unless the user changes it (Anki's default). */
export const DEFAULT_RETENTION = 0.9;

export function createScheduler(desiredRetention: number): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: desiredRetention,
      enable_fuzz: true,
      enable_short_term: true,
    }),
  );
}

export function toFsrsCard(c: SrsFields): FsrsCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.lastReview === null ? undefined : new Date(c.lastReview),
  };
}

export function fromFsrsCard(c: FsrsCard): SrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export function fromFsrsLog(l: ReviewLog): SrsLogFields {
  return {
    rating: l.rating,
    state: l.state,
    due: l.due.getTime(),
    stability: l.stability,
    difficulty: l.difficulty,
    elapsedDays: l.elapsed_days,
    lastElapsedDays: l.last_elapsed_days,
    scheduledDays: l.scheduled_days,
    learningSteps: l.learning_steps,
    review: l.review.getTime(),
  };
}

export function toFsrsLog(l: SrsLogFields): ReviewLog {
  return {
    rating: l.rating as Rating,
    state: l.state as State,
    due: new Date(l.due),
    stability: l.stability,
    difficulty: l.difficulty,
    elapsed_days: l.elapsedDays,
    last_elapsed_days: l.lastElapsedDays,
    scheduled_days: l.scheduledDays,
    learning_steps: l.learningSteps,
    review: new Date(l.review),
  };
}

/** Applies a grade. `now` must be the same instant used for the preview so fuzz matches. */
export function gradeCard(scheduler: FSRS, card: SrsFields, grade: Grade, now: number) {
  const result = scheduler.next(toFsrsCard(card), new Date(now), grade);
  return { card: fromFsrsCard(result.card), log: fromFsrsLog(result.log) };
}

/** Next due time for each grade, used to label the answer buttons. */
export function previewDue(scheduler: FSRS, card: SrsFields, now: number): Record<Grade, number> {
  const preview = scheduler.repeat(toFsrsCard(card), new Date(now));
  return {
    [Rating.Again]: preview[Rating.Again].card.due.getTime(),
    [Rating.Hard]: preview[Rating.Hard].card.due.getTime(),
    [Rating.Good]: preview[Rating.Good].card.due.getTime(),
    [Rating.Easy]: preview[Rating.Easy].card.due.getTime(),
  } as Record<Grade, number>;
}

export function rollbackCard(scheduler: FSRS, card: SrsFields, log: SrsLogFields): SrsFields {
  return fromFsrsCard(scheduler.rollback(toFsrsCard(card), toFsrsLog(log)));
}

export type IntervalUnit = "minute" | "hour" | "day" | "month" | "year";

/** Compact interval for button labels: 10m, 3h, 4d, 2.5mo, 1.2y. */
export function intervalParts(ms: number): { value: number; unit: IntervalUnit } {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return { value: minutes, unit: "minute" };
  const hours = minutes / 60;
  if (hours < 24) return { value: Math.round(hours), unit: "hour" };
  const days = hours / 24;
  if (days < 30) return { value: Math.round(days), unit: "day" };
  if (days < 365) return { value: Math.round((days / 30) * 10) / 10, unit: "month" };
  return { value: Math.round((days / 365) * 10) / 10, unit: "year" };
}
