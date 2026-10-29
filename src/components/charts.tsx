import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { numberFormat } from "../lib/format";
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
