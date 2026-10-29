import type { TFunction } from "i18next";
import { GRADES, type Grade } from "../../../shared/srs";
import { formatInterval } from "../../lib/format";

/** Button labels ("10m", "4d") from each grade's due time, as returned by `previewDue`. */
export function intervalLabels(t: TFunction, due: Record<Grade, number>, now: number) {
  return Object.fromEntries(GRADES.map((g) => [g, formatInterval(t, due[g] - now)])) as Record<Grade, string>;
}
