import { useCallback, useEffect, useRef, useState } from "react";
import { REQUEUE_GAP } from "../../../shared/games";
import { requeue, turns, type Turn } from "./logic";
import type { GameAnswer } from "./types";

/**
 * A game's queue of questions. Missed questions come back a couple of places later (once, unless `maxAttempts`
 * allows more); every answer is logged with its attempt number and how long it took.
 */
export function useTurns<T>(items: readonly T[], { maxAttempts = 2, gap = REQUEUE_GAP } = {}) {
  const [queue, setQueue] = useState(() => turns(items));
  const queueRef = useRef(queue);
  const [index, setIndex] = useState(0);
  const answers = useRef<GameAnswer[]>([]);
  const startedAt = useRef(0);
  const shownAt = useRef(0);

  useEffect(() => {
    startedAt.current = performance.now();
    shownAt.current = startedAt.current;
  }, []);

  const turn = queue[index] as Turn<T>;

  /** Logs an answer to the current question; a wrong one brings the question back later. */
  const record = useCallback(
    (answer: Omit<GameAnswer, "attempt" | "latencyMs">) => {
      const current = queueRef.current[index];
      answers.current.push({ ...answer, attempt: current.attempt, latencyMs: Math.round(performance.now() - shownAt.current) });
      if (!answer.correct && current.attempt < maxAttempts) {
        queueRef.current = requeue(queueRef.current, index, current, gap);
        setQueue(queueRef.current);
      }
    },
    [index, maxAttempts, gap],
  );

  /** Moves to the next question; false when there is none. */
  const advance = useCallback(() => {
    if (index + 1 >= queueRef.current.length) return false;
    setIndex(index + 1);
    shownAt.current = performance.now();
    return true;
  }, [index]);

  const elapsed = useCallback(() => Math.round(performance.now() - startedAt.current), []);

  return { turn, index, total: queue.length, record, advance, answers, elapsed };
}

/** A stopwatch that can pause (for phone interruptions and answer reveals). */
export function useStopwatch() {
  const banked = useRef(0);
  const since = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    since.current = performance.now();
  }, []);

  const elapsed = useCallback(() => banked.current + (since.current === null ? 0 : performance.now() - since.current), []);
  const pause = useCallback(() => {
    if (since.current === null) return;
    banked.current += performance.now() - since.current;
    since.current = null;
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    if (since.current !== null) return;
    since.current = performance.now();
    setPaused(false);
  }, []);
  return { elapsed, pause, resume, paused };
}

/** Pauses a timed game when the page is hidden (another app, a call, a locked phone). */
export function usePauseWhenHidden(pause: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [pause, enabled]);
}

/** Enter or Space moves on once an answer is showing (unless focus is in a text field, which submits on its own). */
export function useAdvanceKeys(active: boolean, next: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (e.key === "Enter" || e.key === " ") {
        // A focused button would also "click" on Enter: handle it once, here.
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next]);
}
