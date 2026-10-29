import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, GraduationCap, Keyboard, Pencil, PartyPopper, Target, Undo2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { FSRS } from "ts-fsrs";
import { createScheduler, gradeCard, previewDue, Rating, type Grade } from "../../shared/srs";
import type { CardDto, ReviewResult } from "../../shared/types";
import { useMe } from "../components/me";
import { CardFormDialog } from "../components/CardFormDialog";
import { CardImage } from "../components/CardPhoto";
import { FlagDot, FlagPill } from "../components/Flags";
import { useFlagName } from "../components/flagName";
import { Menu } from "../components/Menu";
import { FLAGS } from "../../shared/flags";
import { DeckCounts } from "../components/DeckCounts";
import { toast } from "../components/toast";
import { Button, Card, ErrorState, Input, Kbd, PageSpinner, Progress } from "../components/ui";
import { buttonClass, cx } from "../components/classes";
import { burySiblings, dropNote, putBack, remainingCounts, requeue, sortByDue, takeNext, type Queues } from "../features/study/session";
import { DiffText } from "../features/games/DiffText";
import { GradeButtons } from "../features/study/grades";
import { intervalLabels } from "../features/study/intervals";
import { compareAnswer, type TypedResult } from "../features/study/typing";
import { api, queryKeys } from "../lib/api";
import { formatDuration, formatNumber, formatPercent } from "../lib/format";
import { speak, speechSupported } from "../lib/speech";
import { storage } from "../lib/storage";

/** Anki caps time per answer so a card left on screen doesn't skew stats. */
const MAX_ANSWER_MS = 60_000;

type Phase = "loading" | "error" | "empty" | "studying" | "done";

interface HistoryEntry {
  rating: Grade;
  durationMs: number;
  result: Promise<ReviewResult>;
}

interface Summary {
  reviewed: number;
  again: number;
  durationMs: number;
}

export function StudyPage() {
  const { t } = useTranslation();
  const { settings } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const deckId = params.get("deck") ?? undefined;
  const deck = useQuery({ queryKey: queryKeys.deck(deckId ?? ""), queryFn: () => api.deck(deckId!), enabled: !!deckId });
  const exitTo = deckId ? `/decks/${deckId}` : "/";

  const [phase, setPhase] = useState<Phase>("loading");
  const [queues, setQueues] = useState<Queues>({ queue: [], learning: [] });
  const [current, setCurrent] = useState<CardDto | null>(null);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ reviewed: 0, again: 0, durationMs: 0 });
  const [undoing, setUndoing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scheduler, setScheduler] = useState<FSRS>(() => createScheduler(settings.desiredRetention));
  const shownAtRef = useRef(0);
  // Optional "type the answer" mode (Anki's type-in field, Quizlet Write, Memrise). Remembered per device.
  const [typeMode, setTypeMode] = useState(() => storage.get("typeAnswer") === "1");
  const [typedResult, setTypedResult] = useState<TypedResult | null>(null);

  const show = useCallback((next: ReturnType<typeof takeNext>) => {
    setCurrent(next.card);
    setQueues(next.rest);
    setRevealedAt(null);
    setTypedResult(null);
    shownAtRef.current = Date.now();
    return next.card;
  }, []);

  // Loads a session; retrying or checking for more bumps `attempt` to load a fresh one. A response that arrives after
  // the deck changed or the page closed is dropped.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .study(deckId)
      .then((data) => {
        if (cancelled) return;
        setScheduler(createScheduler(data.desiredRetention));
        const card = show(takeNext({ queue: data.queue, learning: sortByDue(data.learning) }, Date.now()));
        setHistory([]);
        setPhase(card ? "studying" : "empty");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, attempt, show]);

  const restart = () => {
    setPhase("loading");
    setAttempt((a) => a + 1);
  };

  // Decks, stats and card lists are stale once anything was graded.
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
    [queryClient],
  );

  // Announce achievements reached in this session (streak, reviews, words learned) on the summary screen.
  useEffect(() => {
    if (phase === "done") void queryClient.invalidateQueries({ queryKey: queryKeys.achievements });
  }, [phase, queryClient]);

  const intervals = useMemo(() => {
    if (!current || revealedAt === null) return null;
    return intervalLabels(t, previewDue(scheduler, current, revealedAt), revealedAt);
  }, [scheduler, current, revealedAt, t]);

  const reveal = useCallback(() => {
    if (current && revealedAt === null) setRevealedAt(Date.now());
  }, [current, revealedAt]);

  const grade = useCallback(
    (rating: Grade) => {
      if (!current || revealedAt === null) return;
      const local = gradeCard(scheduler, current, rating, revealedAt);
      const graded: CardDto = { ...current, ...local.card };
      const durationMs = Math.min(Date.now() - shownAtRef.current, MAX_ANSWER_MS);

      const result = api.review({ cardId: current.id, rating, reviewedAt: revealedAt, sentAt: Date.now(), durationMs });
      const entry: HistoryEntry = { rating, durationMs, result };
      result
        .then((res) => {
          if (res.leech) {
            toast.error(t("study.leech", { front: res.card.front }));
            setQueues((q) => dropNote(q, res.card.noteId));
            return;
          }
          // The server's copy is authoritative; swap it in if the card is waiting in the learning queue.
          setQueues((q) => ({ ...q, learning: q.learning.map((c) => (c.id === res.card.id ? res.card : c)) }));
        })
        .catch(() => {
          toast.error(t("study.saveFailed"));
          setHistory((h) => h.filter((e) => e !== entry));
        });

      setHistory((h) => [...h.slice(-49), entry]);
      setSummary((s) => ({
        reviewed: s.reviewed + 1,
        again: s.again + (rating === Rating.Again ? 1 : 0),
        durationMs: s.durationMs + durationMs,
      }));

      const now = Date.now();
      const card = show(takeNext(requeue(burySiblings(queues, current), graded, now), now));
      if (!card) setPhase("done");
    },
    [scheduler, current, revealedAt, queues, show, t],
  );

  const undo = useCallback(async () => {
    const entry = history.at(-1);
    if (!entry || undoing) return;
    setUndoing(true);
    try {
      const { logId } = await entry.result;
      const restored = await api.undoReview(logId);
      setHistory((h) => h.slice(0, -1));
      setSummary((s) => ({
        reviewed: s.reviewed - 1,
        again: s.again - (entry.rating === Rating.Again ? 1 : 0),
        durationMs: s.durationMs - entry.durationMs,
      }));
      setQueues((q) => putBack(q, current, restored));
      setCurrent(restored);
      setRevealedAt(null);
      setTypedResult(null);
      shownAtRef.current = Date.now();
      setPhase("studying");
    } catch {
      toast.error(t("study.undoFailed"));
    } finally {
      setUndoing(false);
    }
  }, [history, undoing, current, t]);

  const flagName = useFlagName();
  const setFlag = useCallback(
    (flag: number) => {
      if (!current) return;
      const noteId = current.noteId;
      // Flags belong to the word, so update every queued copy of it too.
      const apply = (c: CardDto) => (c.noteId === noteId ? { ...c, flag } : c);
      setCurrent((c) => (c ? apply(c) : c));
      setQueues((q) => ({ queue: q.queue.map(apply), learning: q.learning.map(apply) }));
      api.updateCard(current.id, { flag }).catch(() => toast.error(t("errors.saveFailed")));
    },
    [current, t],
  );

  // "I know this": the word leaves daily study (both directions) and the session moves on.
  const markLearned = useCallback(() => {
    if (!current) return;
    const word = current;
    const card = show(takeNext(dropNote(queues, word.noteId), Date.now()));
    if (!card) setPhase("done");
    api
      .updateCard(word.id, { learned: true })
      .then(() => toast.success(t("study.learnedToast", { front: word.front })))
      .catch(() => toast.error(t("study.learnedFailed")));
  }, [current, queues, show, t]);

  // On a reverse card the word itself is the answer, so it can only be heard after flipping.
  const canSpeak = speechSupported && !!current && (!current.reverse || revealedAt !== null);
  const say = useCallback(() => {
    if (current && canSpeak) speak(current.front, settings.targetLang);
  }, [current, canSpeak, settings.targetLang]);

  // After a mouse/touch click on a study control, release focus so Space/Enter go back to flipping and grading
  // instead of re-pressing that button. Keyboard activation (detail === 0) keeps focus for keyboard users.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const button = (e.target as HTMLElement).closest("button");
      if (button && !button.closest("[role=dialog], [role=menu]")) button.blur();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "Escape") {
        navigate(exitTo);
        return;
      }
      if ((e.key === "z" || e.key === "Z") && !e.altKey) {
        e.preventDefault();
        void undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || phase !== "studying") return;
      if (e.key === " " || e.key === "Enter") {
        // A focused button or link handles these keys itself.
        if (target.closest("button, a")) return;
        e.preventDefault();
        if (revealedAt === null) reveal();
        else grade(Rating.Good);
      } else if (revealedAt !== null && ["1", "2", "3", "4"].includes(e.key)) {
        // preventDefault: grading renders the next card synchronously, and in typing mode its input takes focus —
        // without this the digit would be typed into it.
        e.preventDefault();
        grade(Number(e.key) as Grade);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        say();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        markLearned();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, phase, revealedAt, reveal, grade, undo, say, markLearned, navigate, exitTo]);

  const word = { text: current?.front ?? "", lang: settings.targetLang };
  const meaning = { text: current?.back ?? "", lang: settings.nativeLang };
  const [question, answer] = current?.reverse ? [meaning, word] : [word, meaning];

  const toggleTypeMode = () => {
    storage.set("typeAnswer", typeMode ? "0" : "1");
    setTypeMode(!typeMode);
  };

  const check = (typed: string) => {
    if (typed.trim()) setTypedResult(compareAnswer(typed, answer.text, answer.lang));
    reveal();
  };

  const counts = remainingCounts(queues, current);
  const remaining = counts.newCount + counts.learningCount + counts.reviewCount;
  const progress =
    phase === "done" || summary.reviewed + remaining === 0 ? 1 : summary.reviewed / (summary.reviewed + remaining);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link to={exitTo} className={buttonClass("ghost", "icon", "-ml-2")} aria-label={t("study.exit")}>
            <X />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {deckId ? (deck.data?.name ?? "") : t("study.allDecks")}
          </p>
          {phase === "studying" && <DeckCounts counts={counts} className="hidden text-sm sm:flex" />}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTypeMode}
            aria-pressed={typeMode}
            aria-label={t("study.typeAnswer")}
            title={t("study.typeAnswer")}
            className={typeMode ? "bg-muted text-foreground" : "text-muted-foreground"}
          >
            <Keyboard />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void undo()}
            disabled={history.length === 0}
            loading={undoing}
            aria-label={t("study.undo")}
            title={`${t("study.undo")} (Z)`}
          >
            {!undoing && <Undo2 />}
          </Button>
        </div>
        <Progress value={progress} className="h-0.5" label={t("study.progress")} />
      </header>

      <main className="enter-children mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        {phase === "loading" && <PageSpinner />}
        {phase === "error" && <ErrorState onRetry={restart} />}
        {phase === "empty" && <CaughtUp exitTo={exitTo} deckId={deckId} />}
        {phase === "done" && <SessionComplete summary={summary} exitTo={exitTo} onRestart={restart} />}
        {phase === "studying" && current && (
          <>
            <div className="flip-scene flex flex-1 flex-col">
              {/* Keyed per card: the next word appears unflipped at once instead of turning back over (which
                  would cost a 3D transition and briefly show the new answer on the back face). */}
              <div
                key={current.id}
                className="flip-inner min-h-[min(50dvh,22rem)] flex-1"
                data-flipped={revealedAt !== null}
                onClick={revealedAt === null ? reveal : undefined}
              >
                <Face side="front" hidden={revealedAt !== null} reverse={current.reverse} flag={current.flag}>
                  {/* The photo illustrates the meaning, so it's a clue when the meaning is the question. */}
                  {current.reverse && current.imageKey && (
                    <CardImage imageKey={current.imageKey} alt={current.back} className="mb-6 max-h-56 w-auto max-w-full rounded-xl object-contain" />
                  )}
                  <p lang={question.lang} className="text-4xl font-semibold tracking-tight break-words sm:text-5xl">
                    {question.text}
                  </p>
                </Face>
                <Face side="back" hidden={revealedAt === null} reverse={current.reverse} flag={current.flag}>
                  <p lang={question.lang} className="text-xl font-medium text-muted-foreground break-words">
                    {question.text}
                  </p>
                  <div className="my-6 h-px w-16 bg-border" />
                  {current.imageKey && (
                    <CardImage imageKey={current.imageKey} alt={current.back} className="mb-6 max-h-48 w-auto max-w-full rounded-xl object-contain" />
                  )}
                  <p lang={answer.lang} className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
                    {answer.text}
                  </p>
                  {typedResult && <TypedAnswer result={typedResult} lang={answer.lang} />}
                  {current.example && (
                    <p lang={settings.targetLang} className="mt-6 max-w-prose text-base text-muted-foreground italic">
                      {current.example}
                    </p>
                  )}
                </Face>
              </div>
            </div>

            <div className="mt-4 flex justify-center gap-1">
              {speechSupported && (
                <Button variant="ghost" size="sm" onClick={say} disabled={!canSpeak} title={`${t("study.listen")} (S)`}>
                  <Volume2 />
                  {t("study.listen")}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} title={`${t("study.edit")} (E)`}>
                <Pencil />
                {t("study.edit")}
              </Button>
              <Menu
                label={t("flags.label")}
                trigger={
                  <>
                    {current.flag ? <FlagDot flag={current.flag} /> : null}
                    {t("flags.label")}
                  </>
                }
                items={[
                  { label: t("flags.none"), onSelect: () => setFlag(0) },
                  ...FLAGS.map((f) => ({ label: flagName(f), icon: <FlagDot flag={f} />, onSelect: () => setFlag(f) })),
                ]}
              />
              <Button variant="ghost" size="sm" onClick={markLearned} title={`${t("study.markLearned")} (L)`}>
                <GraduationCap />
                {t("study.markLearned")}
              </Button>
            </div>

            <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
              {revealedAt === null && typeMode ? (
                <TypeAnswerForm key={current.id} lang={answer.lang} onCheck={check} />
              ) : revealedAt === null ? (
                <Button size="lg" className="h-14 w-full text-base" onClick={reveal}>
                  {t("study.showAnswer")}
                  <span className="ml-2 hidden opacity-60 sm:inline">{t("study.space")}</span>
                </Button>
              ) : (
                <div className="animate-rise-in" style={{ animationDuration: "200ms" }}>
                  <GradeButtons intervals={intervals} onGrade={grade} />
                </div>
              )}
              <div className="mt-4 hidden items-center justify-center gap-5 text-xs text-muted-foreground sm:flex">
                {revealedAt === null && typeMode ? (
                  <Hint keys={["↵"]} label={t("study.hintCheck")} />
                ) : revealedAt === null ? (
                  <Hint keys={[t("study.space")]} label={t("study.hintReveal")} />
                ) : (
                  <>
                    <Hint keys={["1", "2", "3", "4"]} label={t("study.hintGrade")} />
                    <Hint keys={[t("study.space")]} label={t("study.grades.good")} />
                  </>
                )}
                <Hint keys={["Z"]} label={t("study.undo")} />
                <Hint keys={["E"]} label={t("study.edit")} />
                <Hint keys={["L"]} label={t("study.markLearned")} />
              </div>
            </div>
          </>
        )}
      </main>

      {current && (
        <CardFormDialog
          open={editing}
          onClose={() => setEditing(false)}
          deckId={current.deckId}
          card={current}
          onSaved={(saved) => setCurrent((c) => (c && c.noteId === saved.noteId ? { ...c, ...pickText(saved) } : c))}
        />
      )}
    </div>
  );
}

/** Holds its own text so typing re-renders only the field, not the whole study card. */
function TypeAnswerForm({ lang, onCheck }: { lang: string; onCheck: (typed: string) => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCheck(typed);
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        autoFocus
        lang={lang}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={t("study.typePlaceholder")}
        placeholder={t("study.typePlaceholder")}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="h-14 text-base"
      />
      <Button type="submit" size="lg" className="h-14 px-6 text-base">
        {typed.trim() ? t("study.check") : t("study.showAnswer")}
      </Button>
    </form>
  );
}

function TypedAnswer({ result, lang }: { result: TypedResult; lang: string }) {
  const { t } = useTranslation();
  if (result.correct) {
    return (
      <p className="mt-5 flex animate-pop items-center gap-1.5 rounded-full bg-review/10 px-3 py-1 text-sm font-medium text-review" style={{ animationDelay: "250ms" }}>
        <Check className="size-4" aria-hidden />
        {t("study.typedCorrect")}
      </p>
    );
  }
  return (
    <div className="mt-5 animate-rise-in rounded-lg bg-muted px-4 py-2 text-left" style={{ animationDelay: "250ms" }}>
      <p className="text-xs text-muted-foreground">{t("study.youTyped")}</p>
      <DiffText parts={result.parts} lang={lang} />
    </div>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      <span className="ml-0.5">{label}</span>
    </span>
  );
}

function pickText(card: CardDto) {
  return { front: card.front, back: card.back, example: card.example, imageKey: card.imageKey, flag: card.flag };
}

function Face({
  side,
  hidden,
  reverse,
  flag,
  children,
}: {
  side: "front" | "back";
  hidden: boolean;
  reverse: boolean;
  flag: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden={hidden}
      className={cx(
        "flip-face relative flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-sm sm:p-12",
        // Each card slides in on its front face, not the 3D container: opacity there would flatten it.
        side === "back" ? "flip-face-back" : "animate-card-in cursor-pointer",
      )}
    >
      {reverse && (
        <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {t("study.reverseBadge")}
        </span>
      )}
      {flag > 0 && <FlagPill flag={flag} className="absolute top-4 left-4 bg-card" />}
      {children}
    </div>
  );
}

function CaughtUp({ exitTo, deckId }: { exitTo: string; deckId?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex size-14 animate-pop items-center justify-center rounded-full bg-review/10 text-review" style={{ animationDelay: "100ms" }}>
        <Check className="size-7" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{t("study.caughtUpTitle")}</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">{t("study.caughtUpDescription")}</p>
      <div className="mt-8 flex gap-3">
        <Link to={exitTo} className={buttonClass("primary")}>
          {deckId ? t("study.backToDeck") : t("study.backToDecks")}
        </Link>
      </div>
    </div>
  );
}

function SessionComplete({ summary, exitTo, onRestart }: { summary: Summary; exitTo: string; onRestart: () => void }) {
  const { t, i18n } = useTranslation();
  const accuracy = summary.reviewed > 0 ? 1 - summary.again / summary.reviewed : 0;
  const tiles = [
    { icon: Check, label: t("study.summary.studied"), value: formatNumber(i18n.language, summary.reviewed) },
    { icon: Target, label: t("study.summary.accuracy"), value: formatPercent(i18n.language, accuracy) },
    { icon: Clock, label: t("study.summary.time"), value: formatDuration(t, summary.durationMs) },
  ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex size-14 animate-pop items-center justify-center rounded-full bg-primary text-primary-foreground" style={{ animationDelay: "100ms" }}>
        <PartyPopper className="size-7" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{t("study.completeTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("study.completeDescription")}</p>
      <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-3">
        {tiles.map(({ icon: Icon, label, value }, i) => (
          <Card key={label} className="animate-rise-in p-4" style={{ animationDelay: `${200 + i * 70}ms` }}>
            <Icon className="mx-auto size-4 text-muted-foreground" aria-hidden />
            <dd className="mt-2 text-xl font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </Card>
        ))}
      </dl>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={onRestart}>
          {t("study.checkAgain")}
        </Button>
        <Link to={exitTo} className={buttonClass("primary")}>
          {t("study.done")}
        </Link>
      </div>
    </div>
  );
}
