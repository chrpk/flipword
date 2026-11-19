import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, Check, Clock, Dumbbell, RotateCcw, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { GAME_INFO, GAMES, HINT_COST, scoreIsTime, type GameId, type GameMode } from "../../shared/games";
import type { PlayCard, PracticeResult } from "../../shared/types";
import { useMe } from "../components/me";
import { toast } from "../components/toast";
import { Button, Card, ErrorState, Kbd, PageSpinner, SegmentedControl } from "../components/ui";
import { buttonClass } from "../components/classes";
import { GAME_CATALOG } from "../features/games/catalog";
import { GAME_ICONS } from "../features/games/icons";
import { accentChars, letters } from "../features/games/logic";
import type { GameOutcome } from "../features/games/types";
import { api, queryKeys } from "../lib/api";
import { formatDuration, formatNumber } from "../lib/format";
import { speak, speechSupported } from "../lib/speech";
import { storage } from "../lib/storage";
import { useFormatScore } from "../features/games/format";

type Phase = { name: "intro" } | { name: "playing"; round: number } | { name: "results"; outcome: GameOutcome; result: PracticeResult | null };

/** Navigation state for a replay of missed words. */
interface RetryState {
  retry: PlayCard[];
}

/** Words longer than this are practised with tiles rather than typed from scratch. */
const LONG_WORD = 12;

/** Which game replays missed words: Spell it, or Unscramble when most of them are long. */
function retryGame(cards: PlayCard[]): GameId {
  const long = cards.filter((c) => letters(c.front).length > LONG_WORD).length;
  return long * 2 > cards.length ? "scramble" : "spell";
}

export default function GamePage() {
  const { deckId = "", game = "" } = useParams();
  const location = useLocation();
  if (!(GAMES as readonly string[]).includes(game)) return <Navigate to={`/decks/${deckId}/games`} replace />;
  const retry = (location.state as RetryState | null)?.retry;
  // Keyed by navigation, so "Practise these" (which may open this same game) starts fresh.
  return <GameScreen key={location.key} deckId={deckId} game={game as GameId} retry={retry} />;
}

function GameScreen({ deckId, game, retry }: { deckId: string; game: GameId; retry?: PlayCard[] }) {
  const { t } = useTranslation();
  const { settings } = useMe();
  const queryClient = useQueryClient();
  const entry = GAME_CATALOG[game];
  const info = GAME_INFO[game];
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [round, setRound] = useState(0);
  const [mode, setMode] = useState<GameMode>(() =>
    retry ? "retry" : info.timed && storage.get(`games.mode.${game}`) === "relaxed" ? "relaxed" : "standard",
  );
  const [sound, setSound] = useState(() => storage.get("games.sound") !== "off");
  const exitTo = `/decks/${deckId}/games`;

  // A fresh draw for every round: due and recently missed words first, as the game's pool asks.
  const cards = useQuery({
    queryKey: ["play", deckId, game, round],
    queryFn: () => api.playCards(deckId, { count: entry.fetchCount, pool: info.pool, needs: info.needs }),
    staleTime: Infinity,
    gcTime: 0,
    enabled: !retry,
  });
  const dealt = useMemo(() => retry ?? cards.data ?? [], [retry, cards.data]);
  const usable = useMemo(() => entry.usable(dealt, settings.targetLang), [entry, dealt, settings.targetLang]);
  const accents = useMemo(() => accentChars(dealt.map((c) => c.front)), [dealt]);
  const loaded = retry !== undefined || cards.isSuccess;

  const submit = useMutation({
    mutationFn: (outcome: GameOutcome) => api.submitGame({ deckId, game, mode, ...outcome }),
    onSuccess: (result, outcome) => {
      setPhase({ name: "results", outcome, result });
      void queryClient.invalidateQueries({ queryKey: queryKeys.games(deckId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards(deckId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.deck(deckId) });
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.achievements });
      if (result.reviewed > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
    onError: (_e, outcome) => {
      toast.error(t("games.saveFailed"));
      setPhase({ name: "results", outcome, result: null });
    },
  });

  const finish = useCallback((outcome: GameOutcome) => submit.mutate(outcome), [submit]);
  const start = useCallback(() => setPhase({ name: "playing", round }), [round]);
  const again = () => {
    setRound((r) => r + 1);
    setPhase({ name: "intro" });
  };
  const chooseMode = (m: GameMode) => {
    setMode(m);
    storage.set(`games.mode.${game}`, m);
  };
  const toggleSound = () => {
    storage.set("games.sound", sound ? "off" : "on");
    setSound(!sound);
  };

  useEffect(() => {
    if (phase.name !== "intro" || !loaded || usable.length < info.minCards) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.name, loaded, usable.length, info.minCards, start]);

  const Game = entry.component;
  const Icon = GAME_ICONS[game];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link to={exitTo} className={buttonClass("ghost", "icon", "-ml-2")} aria-label={t("games.exit")}>
            <X />
          </Link>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <p className="flex-1 font-medium">{t(`games.${game}.name`)}</p>
          {speechSupported && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? t("games.soundOff") : t("games.soundOn")}
              title={sound ? t("games.soundOff") : t("games.soundOn")}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
          )}
        </div>
      </header>

      <main className="enter-children mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        {(!retry && cards.isPending) || submit.isPending ? (
          <PageSpinner />
        ) : !retry && cards.error ? (
          <ErrorState onRetry={() => void cards.refetch()} />
        ) : usable.length < info.minCards ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-medium">{t("games.notEnoughTitle")}</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {game === "gapline" ? t("games.gapline.needsExamples") : t("games.needCards", { count: info.minCards })}
            </p>
            <Link to={`/decks/${deckId}`} className={buttonClass("secondary", "md", "mt-6")}>
              {t("games.backToDeck")}
            </Link>
          </div>
        ) : phase.name === "intro" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 flex size-14 animate-pop items-center justify-center rounded-2xl bg-muted" style={{ animationDelay: "100ms" }}>
              <Icon className="size-7" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t(`games.${game}.name`)}</h1>
            <p className="mt-3 max-w-md text-muted-foreground">
              {retry ? t("games.retryIntro", { count: usable.length }) : t(`games.${game}.howTo`, { cost: HINT_COST })}
            </p>
            {info.timed && !retry && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <SegmentedControl
                  label={t("games.modeLabel")}
                  value={mode}
                  onChange={chooseMode}
                  options={[
                    { value: "standard", label: t("games.modes.standard") },
                    { value: "relaxed", label: t("games.modes.relaxed") },
                  ]}
                />
                <p className="max-w-sm text-xs text-muted-foreground">{t(`games.modes.${mode}Hint`)}</p>
              </div>
            )}
            <Button size="lg" className="mt-8" onClick={start} autoFocus>
              {t("games.start")}
              <ArrowRight />
            </Button>
            <p className="mt-3 hidden text-xs text-muted-foreground sm:block">
              <Kbd>↵</Kbd> {t("games.toStart")}
            </p>
          </div>
        ) : phase.name === "playing" ? (
          <Game
            key={phase.round}
            cards={usable}
            pool={dealt}
            langs={{ word: settings.targetLang, meaning: settings.nativeLang }}
            mode={mode}
            lenientAccents={settings.lenientAccents}
            accents={accents}
            sound={sound}
            onFinish={finish}
          />
        ) : (
          <Results
            deckId={deckId}
            game={game}
            mode={mode}
            outcome={phase.outcome}
            result={phase.result}
            cards={dealt}
            lang={settings.targetLang}
            onAgain={again}
            exitTo={exitTo}
          />
        )}
      </main>
    </div>
  );
}

function Results({
  deckId,
  game,
  mode,
  outcome,
  result,
  cards,
  lang,
  onAgain,
  exitTo,
}: {
  deckId: string;
  game: GameId;
  mode: GameMode;
  outcome: GameOutcome;
  result: PracticeResult | null;
  cards: PlayCard[];
  lang: string;
  onAgain: () => void;
  exitTo: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const formatBest = useFormatScore();
  // Words answered more than once (missed, then retried) count once: by their first try.
  const firsts = outcome.answers.filter((a) => (a.attempt ?? 1) === 1);
  const correct = firsts.filter((a) => a.correct).length;
  const wrong = firsts.length - correct;
  const missedIds = new Set(outcome.answers.filter((a) => !a.correct).map((a) => a.cardId));
  const missed = cards.filter((c) => missedIds.has(c.id));
  const practise = () => navigate(`/decks/${deckId}/games/${retryGame(missed)}`, { state: { retry: missed } satisfies RetryState });

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      {outcome.won !== undefined && (
        <p className={`mb-4 animate-pop text-lg font-semibold ${outcome.won ? "text-review" : "text-destructive"}`}>
          {outcome.won ? t("games.showdown.won") : t("games.showdown.lost")}
        </p>
      )}
      {result?.isBest ? (
        <p className="mb-4 inline-flex animate-pop items-center gap-1.5 rounded-full bg-learning/10 px-3 py-1 text-sm font-medium text-learning" style={{ animationDelay: "450ms" }}>
          <Trophy className="size-4" aria-hidden />
          {t("games.newBest")}
        </p>
      ) : result?.best != null ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("games.bestLabel", { value: formatBest(game, result.best, mode) })}</p>
      ) : null}
      <p className="text-sm text-muted-foreground">{scoreIsTime(game, mode) ? t("games.yourTime") : t("games.yourScore")}</p>
      <p className="mt-1 animate-pop text-6xl font-bold tracking-tight" style={{ animationDelay: "100ms" }}>
        {formatBest(game, outcome.score, mode)}
      </p>

      <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-3">
        {[
          { icon: Check, label: t("games.correctCount"), value: formatNumber(i18n.language, correct) },
          { icon: X, label: t("games.wrongCount"), value: formatNumber(i18n.language, wrong) },
          { icon: Clock, label: t("games.time"), value: formatDuration(t, outcome.durationMs) },
        ].map(({ icon: Icon, label, value }, i) => (
          <Card key={label} className="animate-rise-in p-4" style={{ animationDelay: `${200 + i * 70}ms` }}>
            <Icon className="mx-auto size-4 text-muted-foreground" aria-hidden />
            <dd className="mt-2 text-xl font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </Card>
        ))}
      </dl>

      {result && result.reviewed > 0 && (
        <p className="mt-6 inline-flex animate-rise-in items-center gap-1.5 text-sm text-muted-foreground" style={{ animationDelay: "380ms" }}>
          <CalendarCheck className="size-4" aria-hidden />
          {t("games.reviewed", { count: result.reviewed })}
        </p>
      )}

      {missed.length > 0 && (
        <section className="mt-10 w-full max-w-md animate-rise-in text-left" style={{ animationDelay: "420ms" }}>
          <h2 className="text-sm font-semibold">{t("games.toReview")}</h2>
          <ul className="mt-3 divide-y rounded-xl border">
            {missed.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-1.5 pr-4 pl-1.5 text-sm">
                {speechSupported ? (
                  <Button variant="ghost" size="icon" onClick={() => speak(c.front, lang)} aria-label={t("games.listenTo", { word: c.front })}>
                    <Volume2 />
                  </Button>
                ) : (
                  <span className="w-2" />
                )}
                <span lang={lang} className="font-medium">
                  {c.front}
                </span>
                <span className="flex-1 text-right text-muted-foreground">{c.back}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to={exitTo} className={buttonClass("secondary")}>
          {t("games.allGames")}
        </Link>
        {missed.length > 0 ? (
          <>
            <Button variant="secondary" onClick={onAgain}>
              <RotateCcw />
              {t("games.playAgain")}
            </Button>
            <Button onClick={practise} autoFocus>
              <Dumbbell />
              {t("games.practiseMissed", { count: missed.length })}
            </Button>
          </>
        ) : (
          <Button onClick={onAgain} autoFocus>
            <RotateCcw />
            {t("games.playAgain")}
          </Button>
        )}
      </div>
    </div>
  );
}
