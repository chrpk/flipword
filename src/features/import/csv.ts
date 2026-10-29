import Papa from "papaparse";
import { cleanCell } from "./text";

export interface TableData {
  rows: string[][];
  columnCount: number;
}

const HEADER_WORDS = /^(front|back|term|definition|word|translation|meaning|example|question|answer)$/i;

export function parseDelimited(text: string): TableData {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  const rows = result.data.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c !== ""));
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { rows, columnCount };
}

export function looksLikeHeader(row: string[] | undefined) {
  return !!row && row.some((c) => HEADER_WORDS.test(c));
}

/** Guesses column roles from a header row; defaults to front=0, back=1. */
export function guessColumns(header: string[] | undefined, columnCount: number) {
  const find = (re: RegExp) => header?.findIndex((h) => re.test(h)) ?? -1;
  const front = Math.max(0, find(/^(front|term|word|question)$/i));
  let back = find(/^(back|definition|translation|meaning|answer)$/i);
  if (back < 0) back = columnCount > 1 ? (front === 0 ? 1 : 0) : 0;
  const example = find(/^example/i);
  return { front, back, example };
}
