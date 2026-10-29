import { LEARN_AHEAD_MS, State } from "../../../shared/srs";
import type { CardDto } from "../../../shared/types";

export interface Queues {
  /** Due reviews followed by new cards, in study order. */
  queue: CardDto[];
  /** Cards in (re)learning, sorted by due. */
  learning: CardDto[];
}

export function isLearning(card: CardDto) {
  return card.state === State.Learning || card.state === State.Relearning;
}

export function sortByDue(cards: CardDto[]) {
  return [...cards].sort((a, b) => a.due - b.due);
}

/**
 * Picks the next card: a learning card that is already due, otherwise the next queued card,
 * otherwise the earliest learning card (studied a little early rather than making the user wait).
 */
export function takeNext({ queue, learning }: Queues, now: number): { card: CardDto | null; rest: Queues } {
  const [firstLearning, ...otherLearning] = learning;
  if (firstLearning && firstLearning.due <= now) {
    return { card: firstLearning, rest: { queue, learning: otherLearning } };
  }
  const [firstQueued, ...otherQueued] = queue;
  if (firstQueued) return { card: firstQueued, rest: { queue: otherQueued, learning } };
  if (firstLearning) return { card: firstLearning, rest: { queue, learning: otherLearning } };
  return { card: null, rest: { queue, learning } };
}

/** After grading, learning cards due soon come back in this session. */
export function requeue(queues: Queues, graded: CardDto, now: number): Queues {
  if (!isLearning(graded) || graded.due - now > LEARN_AHEAD_MS) return queues;
  return { ...queues, learning: sortByDue([...queues.learning.filter((c) => c.id !== graded.id), graded]) };
}

/**
 * After an undo, the card that was on screen goes back where it came from: learning cards into the learning queue
 * (ordered by due time), everything else to the front of the main queue.
 */
export function putBack(queues: Queues, card: CardDto | null, restored: CardDto): Queues {
  const learning = queues.learning.filter((c) => c.id !== restored.id);
  if (!card) return { queue: queues.queue, learning };
  if (isLearning(card)) return { queue: queues.queue, learning: sortByDue([...learning.filter((c) => c.id !== card.id), card]) };
  return { queue: [card, ...queues.queue], learning };
}

/** Anki-style sibling burying: once one direction of a word is answered, its other queued direction waits. */
export function burySiblings(queues: Queues, answered: CardDto): Queues {
  return { ...queues, queue: queues.queue.filter((c) => c.noteId !== answered.noteId) };
}

/** Removes every card of a word, e.g. after it was suspended as a leech. */
export function dropNote(queues: Queues, noteId: string): Queues {
  return {
    queue: queues.queue.filter((c) => c.noteId !== noteId),
    learning: queues.learning.filter((c) => c.noteId !== noteId),
  };
}

/** Remaining counts including the card on screen. */
export function remainingCounts({ queue, learning }: Queues, current: CardDto | null) {
  const all = current ? [current, ...queue, ...learning] : [...queue, ...learning];
  return {
    newCount: all.filter((c) => c.state === State.New).length,
    learningCount: all.filter(isLearning).length,
    reviewCount: all.filter((c) => c.state === State.Review).length,
  };
}
