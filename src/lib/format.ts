import type { TFunction } from "i18next";
import { intervalParts } from "../../shared/srs";

export function formatInterval(t: TFunction, ms: number) {
  const { value, unit } = intervalParts(ms);
  return t(`interval.${unit}`, { count: value });
}

// Constructing an Intl formatter resolves locale data and is far slower than formatting; reuse them.
const formatters = new Map<string, unknown>();
function cached<T>(key: string, create: () => T): T {
  let f = formatters.get(key) as T | undefined;
  if (!f) formatters.set(key, (f = create()));
  return f;
}

export const numberFormat = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  cached(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options));

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/** "in 3 days", "tomorrow", "in 10 minutes". */
export function formatRelative(locale: string, target: number, now = Date.now()) {
  const diff = target - now;
  const rtf = cached(`r|${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= size || unit === "minute") return rtf.format(Math.round(diff / size), unit);
  }
  return rtf.format(0, "minute");
}

export function formatDuration(t: TFunction, ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return t("duration.seconds", { count: Math.max(0, Math.round(ms / 1000)) });
  if (minutes < 60) return t("duration.minutes", { count: minutes });
  return t("duration.hours", { count: Math.floor(minutes / 60), minutes: minutes % 60 });
}

export function formatNumber(locale: string, n: number) {
  return numberFormat(locale).format(n);
}

export function formatPercent(locale: string, n: number) {
  return numberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(n);
}

export function formatDate(locale: string, ms: number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return cached(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options)).format(ms);
}
