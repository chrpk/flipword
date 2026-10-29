import type { DiffPart } from "../study/typing";

const STYLES = {
  good: "text-review",
  bad: "text-destructive line-through decoration-2",
  missed: "text-muted-foreground underline decoration-dotted underline-offset-4",
} as const;

/** A typed answer with right (green), wrong (struck red) and missing (dotted) characters. */
export function DiffText({ parts, lang }: { parts: DiffPart[]; lang: string }) {
  return (
    <p lang={lang} className="font-mono text-lg break-all">
      {parts.map((p, i) => (
        <span key={i} className={STYLES[p.kind]}>
          {p.text}
        </span>
      ))}
    </p>
  );
}
