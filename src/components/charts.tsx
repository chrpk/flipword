import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDate, numberFormat } from "../lib/format";
import { cx } from "./classes";

export interface Column {
  key: string;
  /** Short axis label (e.g. "Mon 3"). */
  label: string;
  value: number;
  /** Tooltip line under the label. */
  detail: string;
}

/** Rounds up to 1, 2 or 5 × 10ⁿ so ticks are clean numbers. */
function niceMax(max: number) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

const compact = (locale: string, n: number) => numberFormat(locale, { notation: "compact" }).format(n);

/** Single-series column chart: thin columns, hairline grid, hover/focus tooltip, hidden data table. */
export function ColumnChart({
  data,
  locale,
  title,
  highlightLast = false,
  highlightFirst = false,
}: {
  data: Column[];
  locale: string;
  title: string;
  highlightLast?: boolean;
  highlightFirst?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [top, top / 2, 0];
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  /** The column under the pointer. */
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * data.length);
    setActive(Math.min(data.length - 1, Math.max(0, i)));
  };

  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = data.length - 1;
    const from = active ?? last;
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        <div className="flex h-44 flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compact(locale, t)}
            </span>
          ))}
        </div>
        {/* One focusable chart rather than a button per column: 30 columns are far narrower than a usable touch
            target on a phone. Arrow keys step through the days; hovering or tapping picks the column under the pointer. */}
        <div
          className="relative h-44 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          role="group"
          tabIndex={0}
          aria-label={title}
          aria-describedby={tableId}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onFocus={() => setActive((a) => a ?? data.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={step}
        >
          {ticks.map((t, i) => (
            <div
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-t border-border"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden>
            {data.map((d, i) => {
              const emphasized = (highlightLast && i === data.length - 1) || (highlightFirst && i === 0);
              return (
                <div key={d.key} className="flex h-full min-w-0 flex-1 items-end justify-center">
                  <span
                    className={cx(
                      "block w-full max-w-6 origin-bottom animate-grow-y rounded-t-[4px] transition-opacity",
                      d.value > 0 ? "min-h-[2px]" : "",
                      emphasized ? "bg-primary" : "bg-primary/45",
                      active !== null && active !== i && "opacity-40",
                    )}
                    style={{ height: `${(d.value / top) * 100}%`, animationDelay: `${Math.min(i * 12, 360)}ms` }}
                  />
                </div>
              );
            })}
          </div>
          {active !== null && data[active] && (
            <div
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
            >
              <p className="font-medium">{data[active].label}</p>
              <p className="text-muted-foreground">{data[active].detail}</p>
            </div>
          )}
          <p aria-live="polite" className="sr-only">
            {active !== null && data[active] ? `${data[active].label}: ${data[active].detail}` : ""}
          </p>
        </div>
        <div />
        <div className="relative mt-2 h-4 text-[11px] text-muted-foreground" aria-hidden>
          {data.map((d, i) =>
            labelIdx.has(i) ? (
              <span
                key={d.key}
                className={cx(
                  "absolute whitespace-nowrap",
                  i === 0 ? "left-0" : i === data.length - 1 ? "right-0" : "-translate-x-1/2",
                )}
                style={i !== 0 && i !== data.length - 1 ? { left: `${((i + 0.5) / data.length) * 100}%` } : undefined}
              >
                {d.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** Tailwind background class for the mark. */
  color: string;
}

/** 100% stacked bar with a legend that carries labels and values (identity never by colour alone). */
export function StackedBar({ segments, locale, title }: { segments: Segment[]; locale: string; title: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const fmt = numberFormat(locale);
  const pct = numberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  return (
    <figure className="m-0">
      <div className="flex h-3 gap-[2px]" role="img" aria-label={title}>
        {total === 0 ? (
          <div className="h-full flex-1 rounded-[4px] bg-muted" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.key}
                className={cx("h-full first:rounded-l-[4px] last:rounded-r-[4px]", s.color)}
                style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4 }}
                title={`${s.label}: ${fmt.format(s.value)}`}
              />
            ))
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={cx("size-2.5 rounded-full", s.color)} aria-hidden />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{fmt.format(s.value)}</span>
            {total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{pct.format(s.value / total)}</span>}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export interface CalendarDay {
  key: string;
  /** Local midnight of the day. */
  date: number;
  value: number;
  /** Full date (e.g. "Tue, Oct 28"). */
  label: string;
  detail: string;
}

/** 0 = Sunday … 6 = Saturday. Falls back to Monday where the browser has no week data. */
function firstDayOfWeek(locale: string) {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return ((l.getWeekInfo?.() ?? l.weekInfo)?.firstDay ?? 1) % 7;
  } catch {
    return 1;
  }
}

const HEAT = ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];

/** Activity calendar: one column per week, one square per day, shaded by value relative to the busiest day. */
export function CalendarHeatmap({
  days,
  locale,
  title,
  summary,
  less,
  more,
}: {
  /** Consecutive days, oldest first. */
  days: CalendarDay[];
  locale: string;
  title: string;
  /** Shown under the grid while no day is picked. */
  summary: string;
  less: string;
  more: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const firstDay = firstDayOfWeek(locale);
  const lead = days.length ? (new Date(days[0].date).getDay() - firstDay + 7) % 7 : 0;
  const weeks = Math.ceil((lead + days.length) / 7);
  const max = Math.max(1, ...days.map((d) => d.value));
  const level = (v: number) => (v === 0 ? 0 : Math.ceil((v / max) * (HEAT.length - 1)));

  // Month names over the week that holds the 1st, unless too close to the right edge to fit.
  const months = days.flatMap((d, i) =>
    new Date(d.date).getDate() === 1 && Math.floor((lead + i) / 7) < weeks - 2
      ? [{ col: Math.floor((lead + i) / 7), label: formatDate(locale, d.date, { month: "short" }) }]
      : [],
  );
  // Label every other row, like a wall calendar's margin. Jan 7 2024 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, r) =>
    r % 2 === 1 ? formatDate(locale, new Date(2024, 0, 7 + ((firstDay + r) % 7)).getTime(), { weekday: "short" }) : "",
  );

  // Start scrolled to today on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const i = (e.target as HTMLElement).dataset.i;
    if (i !== undefined) setActive(Number(i));
  };

  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = days.length - 1;
    const from = active ?? last;
    const next = { ArrowLeft: from - 7, ArrowRight: from + 7, ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: last }[
      e.key
    ];
    if (next === undefined) return;
    e.preventDefault();
    const i = Math.min(last, Math.max(0, next));
    setActive(i);
    scroller.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const columns = { gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))` };
  const current = active !== null ? days[active] : undefined;

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        {/* Stretches to the grid's height; the margins skip the month row and the scroller's bottom padding. */}
        <div className="mt-5 mb-1 grid grid-rows-7 gap-[3px] text-[11px] leading-none text-muted-foreground" aria-hidden>
          {weekdays.map((w, r) => (
            <span key={r} className="flex items-center">
              {w}
            </span>
          ))}
        </div>
        <div ref={scroller} className="overflow-x-auto pb-1">
          <div>
            <div className="grid h-5 gap-[3px] text-[11px] text-muted-foreground" style={columns} aria-hidden>
              {months.map((m) => (
                <span key={m.col} className="whitespace-nowrap" style={{ gridColumnStart: m.col + 1 }}>
                  {m.label}
                </span>
              ))}
            </div>
            {/* One focusable grid rather than a button per day, as in ColumnChart: arrow keys move by day (up/down)
                and by week (left/right); hovering or tapping picks the square under the pointer. */}
            <div
              className="grid grid-flow-col grid-rows-7 gap-[3px] rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
              style={columns}
              role="group"
              tabIndex={0}
              aria-label={title}
              aria-describedby={tableId}
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
              onFocus={() => setActive((a) => a ?? days.length - 1)}
              onBlur={() => setActive(null)}
              onKeyDown={step}
            >
              {Array.from({ length: lead }, (_, i) => (
                <span key={`lead-${i}`} aria-hidden />
              ))}
              {days.map((d, i) => (
                <span
                  key={d.key}
                  data-i={i}
                  aria-hidden
                  className={cx(
                    "aspect-square rounded-[3px]",
                    HEAT[level(d.value)],
                    i === active && "outline-2 outline-offset-1 outline-foreground",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p aria-live="polite" className="tabular-nums">
          {current ? (
            <>
              <span className="font-medium text-foreground">{current.label}</span> · {current.detail}
            </>
          ) : (
            summary
          )}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="mr-1">{less}</span>
          {HEAT.map((c) => (
            <span key={c} className={cx("size-2.5 rounded-[3px]", c)} />
          ))}
          <span className="ml-1">{more}</span>
        </div>
      </div>
      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {days
            .filter((d) => d.value > 0)
            .map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{d.detail}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
