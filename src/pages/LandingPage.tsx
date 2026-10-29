import { ArrowRight, Bot, Camera, Download, FileUp, Keyboard, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { GAME_INFO, GAMES } from "../../shared/games";
import { createScheduler, DEFAULT_RETENTION, gradeCard, newSrsFields, previewDue, Rating, type Grade } from "../../shared/srs";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { buttonClass, cx } from "../components/classes";
import { GAME_ICONS } from "../features/games/icons";
import { GradeButtons } from "../features/study/grades";
import { intervalLabels } from "../features/study/intervals";
import { formatInterval, formatPercent } from "../lib/format";

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "import", icon: FileUp },
  { key: "typing", icon: Keyboard },
  { key: "media", icon: Camera },
  { key: "achievements", icon: Trophy },
  { key: "assistant", icon: Bot },
  { key: "install", icon: Download },
];

const GAME_KINDS = ["recognition", "recall"] as const;

/** Sample words in the language most new users pick (Spanish); the meanings are English, like the interface. */
const SAMPLE_CARDS = [
  { front: "la mariposa", back: "butterfly", example: "Una mariposa entró por la ventana." },
  { front: "madrugar", back: "to get up early", example: "Los lunes tengo que madrugar." },
  { front: "la sobremesa", back: "lingering at the table after a meal", example: "La sobremesa duró tres horas." },
  { front: "el desayuno", back: "breakfast", example: "El desayuno está listo." },
];

// The real scheduler from a fixed instant: fuzz is seeded from the card and review time, so every visitor
// sees the same numbers.
const EPOCH = Date.UTC(2026, 0, 1, 9);
const scheduler = createScheduler(DEFAULT_RETENTION);
const NEW_CARD_DUE = previewDue(scheduler, newSrsFields(EPOCH), EPOCH);

/** Gaps between reviews for a new word answered Good on time, every time. */
function goodLadder(steps: number) {
  const gaps: number[] = [];
  let card = newSrsFields(EPOCH);
  let now = EPOCH;
  for (let i = 0; i < steps; i++) {
    card = gradeCard(scheduler, card, Rating.Good, now).card;
    gaps.push(card.due - now);
    now = card.due;
  }
  return gaps;
}

const GAPS = goodLadder(6);
const MAX_GAP = Math.max(...GAPS);
const TOTAL_GAP = GAPS.reduce((sum, g) => sum + g, 0);

function DemoCard() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const card = SAMPLE_CARDS[index % SAMPLE_CARDS.length];
  const intervals = intervalLabels(t, NEW_CARD_DUE, EPOCH);

  const grade = (g: Grade) => {
    setResult(t("landing.demo.result", { word: card.front, interval: intervals[g] }));
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  return (
    <section aria-label={t("landing.demo.label")} className="w-full">
      <p className="mb-3 text-sm text-muted-foreground">{t("landing.demo.hint")}</p>
      <div className="flip-scene">
        {/* Keyed per card so the next word appears unflipped instead of turning back over. */}
        <div key={index} className="flip-inner h-72" data-flipped={flipped}>
          <button
            type="button"
            aria-hidden={flipped}
            tabIndex={flipped ? -1 : 0}
            onClick={() => setFlipped(true)}
            className={cx(
              "flip-face flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-sm",
              // Not the 3D container: opacity there would flatten it. The back face is hidden while this runs.
              index > 0 && "animate-card-in",
            )}
          >
            <span lang="es" className="text-4xl font-semibold tracking-tight break-words">
              {card.front}
            </span>
            <span className="mt-6 text-sm text-muted-foreground">{t("study.showAnswer")}</span>
          </button>
          <div
            aria-hidden={!flipped}
            className="flip-face flip-face-back flex flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center shadow-sm"
          >
            <p lang="es" className="text-lg font-medium text-muted-foreground">
              {card.front}
            </p>
            <div className="my-6 h-px w-16 bg-border" />
            <p className="text-3xl font-semibold tracking-tight text-balance break-words">{card.back}</p>
            <p lang="es" className="mt-6 text-muted-foreground italic">
              {card.example}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <GradeButtons intervals={intervals} onGrade={grade} disabled={!flipped} />
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm font-medium">
        <span key={index} className="inline-block animate-fade-in">
          {result}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("landing.demo.footnote")}</p>
    </section>
  );
}

function IntervalLadder() {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  return (
    <figure className="rounded-xl border bg-card p-5 sm:p-6">
      <figcaption className="text-sm font-semibold">{t("landing.how.chartTitle")}</figcaption>
      <ol className="mt-5 space-y-2.5" onMouseLeave={() => setActive(null)}>
        {GAPS.map((gap, i) => (
          <li
            key={i}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 rounded-md text-sm"
          >
            <span className="text-muted-foreground">{t("landing.how.review", { n: i + 1 })}</span>
            <span className="h-3 rounded-r-[4px] bg-muted">
              <span
                className={cx("block h-full rounded-r-[4px] bg-review transition-opacity", active !== null && active !== i && "opacity-40")}
                // Linear scale: the early gaps are tiny next to the later ones, which is the point.
                style={{ width: `${Math.max(0.75, (gap / MAX_GAP) * 100)}%` }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">{formatInterval(t, gap)}</span>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="mt-5 border-t pt-4 text-sm text-muted-foreground">
        {active === null
          ? t("landing.how.summary", { count: GAPS.length, total: formatInterval(t, TOTAL_GAP) })
          : `${t("landing.how.review", { n: active + 1 })}: ${t("landing.how.gap", { interval: formatInterval(t, GAPS[active]) })}`}
      </p>
    </figure>
  );
}

/** Shown at `/` to visitors who aren't signed in. */
export function LandingPage() {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main id="main">
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1fr_26rem] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="min-w-0 animate-rise-in">
            <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{t("landing.eyebrow")}</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t("landing.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("landing.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className={buttonClass("primary", "lg")}>
                {t("landing.getStarted")}
                <ArrowRight />
              </Link>
              <a href="#how" className={buttonClass("ghost", "lg")}>
                {t("landing.howItWorks")}
              </a>
            </div>
          </div>
          <div className="animate-rise-in" style={{ animationDelay: "120ms" }}>
            <DemoCard />
          </div>
        </section>

        <section id="how" className="scroll-mt-4 border-t">
          <div className="mx-auto grid max-w-5xl items-start gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <h2 className="text-3xl font-bold tracking-tight text-balance">{t("landing.how.title")}</h2>
              <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">
                {t("landing.how.body", { retention: formatPercent(i18n.language, DEFAULT_RETENTION) })}
              </p>
            </div>
            <IntervalLadder />
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">{t("landing.features.title")}</h2>
            <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <li key={key} className="min-w-0">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`landing.features.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`landing.features.${key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">{t("landing.games.title", { count: GAMES.length })}</h2>
            <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">{t("landing.games.body")}</p>
            <dl className="mt-8 space-y-4">
              {GAME_KINDS.map((kind) => (
                <div key={kind} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <dt className="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t(`games.kind.${kind}`)}
                  </dt>
                  <dd className="flex flex-wrap gap-3">
                    {GAMES.filter((id) => GAME_INFO[id].kind === kind).map((id) => {
                      const Icon = GAME_ICONS[id];
                      return (
                        <span key={id} className="flex items-center gap-3 rounded-full border py-2 pr-4 pl-2.5">
                          <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="text-sm font-medium">{t(`games.${id}.name`)}</span>
                        </span>
                      );
                    })}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="text-3xl font-bold tracking-tight">{t("landing.cta.title")}</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{t("landing.cta.body")}</p>
            </div>
            <Link to="/login" className={buttonClass("primary", "lg")}>
              {t("landing.getStarted")}
              <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
