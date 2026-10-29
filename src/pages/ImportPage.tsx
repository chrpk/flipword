import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, FileUp, Package, RefreshCw } from "lucide-react";
import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { LIMITS } from "../../shared/schemas";
import type { DeckSummary } from "../../shared/types";
import { toast } from "../components/toast";
import { Button, Card, Checkbox, Field, Input, PageSpinner, Progress, Select, Spinner } from "../components/ui";
import { buttonClass, cx } from "../components/classes";
import { AnkiImportError, parseAnkiPackage, type AnkiNoteType } from "../features/import/anki";
import { guessColumns, looksLikeHeader, parseDelimited, type TableData } from "../features/import/csv";
import { api, queryKeys } from "../lib/api";
import { formatNumber } from "../lib/format";

const NONE = -1;
const PREVIEW_ROWS = 5;

interface Mapping {
  front: number;
  back: number;
  example: number;
}

type Source =
  | { kind: "csv"; fileName: string; table: TableData; hasHeader: boolean }
  | { kind: "anki"; fileName: string; types: AnkiNoteType[]; typeId: string };

type Status =
  | { step: "pick" }
  | { step: "parsing" }
  | { step: "map" }
  | { step: "importing"; done: number; total: number }
  | { step: "finished"; deckId: string; created: number; skipped: number };

const clip = (s: string) => s.slice(0, LIMITS.cardField);

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, LIMITS.deckName);
}

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const decks = useQuery({ queryKey: queryKeys.decks, queryFn: api.decks });
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ step: "pick" });
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<Mapping>({ front: 0, back: 1, example: NONE });
  const [targetDeck, setTargetDeck] = useState<string>(params.get("deck") ?? "new");
  const [newDeckName, setNewDeckName] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const columns: string[] = useMemo(() => {
    if (!source) return [];
    if (source.kind === "anki") return source.types.find((ty) => ty.id === source.typeId)?.fields ?? [];
    const header = source.hasHeader ? source.table.rows[0] : undefined;
    return Array.from({ length: source.table.columnCount }, (_, i) =>
      header?.[i] ? header[i] : t("import.column", { n: i + 1 }),
    );
  }, [source, t]);

  const rows: string[][] = useMemo(() => {
    if (!source) return [];
    if (source.kind === "anki") return source.types.find((ty) => ty.id === source.typeId)?.notes ?? [];
    return source.hasHeader ? source.table.rows.slice(1) : source.table.rows;
  }, [source]);

  const cards = useMemo(
    () =>
      rows
        .map((r) => ({
          front: clip(r[mapping.front] ?? ""),
          back: clip(r[mapping.back] ?? ""),
          example: mapping.example === NONE ? "" : clip(r[mapping.example] ?? ""),
        }))
        .filter((c) => c.front && c.back),
    [rows, mapping],
  );

  const handleFile = async (file: File) => {
    setStatus({ step: "parsing" });
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".apkg") || lower.endsWith(".colpkg")) {
        const types = await parseAnkiPackage(await file.arrayBuffer());
        setSource({ kind: "anki", fileName: file.name, types, typeId: types[0].id });
        setMapping({ front: 0, back: types[0].fields.length > 1 ? 1 : 0, example: NONE });
      } else {
        const table = parseDelimited(await file.text());
        if (table.rows.length === 0) throw new AnkiImportError("empty");
        const hasHeader = looksLikeHeader(table.rows[0]);
        setSource({ kind: "csv", fileName: file.name, table, hasHeader });
        setMapping(guessColumns(hasHeader ? table.rows[0] : undefined, table.columnCount));
      }
      setNewDeckName(baseName(file.name));
      setStatus({ step: "map" });
    } catch (e) {
      toast.error(e instanceof AnkiImportError && e.code === "empty" ? t("import.errors.empty") : t("import.errors.invalid"));
      setStatus({ step: "pick" });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const runImport = async () => {
    if (cards.length === 0) return;
    setStatus({ step: "importing", done: 0, total: cards.length });
    try {
      let deckId = targetDeck;
      if (deckId === "new") {
        const deck: DeckSummary = await api.createDeck({ name: newDeckName.trim() || t("import.untitled") });
        deckId = deck.id;
      }
      let created = 0;
      let skipped = 0;
      for (let i = 0; i < cards.length; i += LIMITS.bulkCards) {
        const res = await api.importCards(deckId, cards.slice(i, i + LIMITS.bulkCards), skipDuplicates);
        created += res.created;
        skipped += res.skipped;
        setStatus({ step: "importing", done: Math.min(i + LIMITS.bulkCards, cards.length), total: cards.length });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      setStatus({ step: "finished", deckId, created, skipped });
    } catch {
      toast.error(t("import.errors.failed"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      setStatus({ step: "map" });
    }
  };

  const reset = () => {
    setSource(null);
    setStatus({ step: "pick" });
    if (inputRef.current) inputRef.current.value = "";
  };

  if (decks.isPending) return <PageSpinner />;

  const backTo = params.get("deck") ? `/decks/${params.get("deck")}` : "/";
  const fmt = (n: number) => formatNumber(i18n.language, n);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={backTo}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("common.back")}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t("import.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("import.subtitle")}</p>

      {(status.step === "pick" || status.step === "parsing") && (
        <div className="mt-10">
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
              dragging ? "border-ring bg-muted" : "hover:bg-muted/50",
            )}
          >
            {status.step === "parsing" ? (
              <Spinner label={t("import.reading")} />
            ) : (
              <>
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                  <FileUp className="size-6 text-muted-foreground" aria-hidden />
                </div>
                <p className="font-medium">{t("import.dropTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("import.dropDescription")}</p>
              </>
            )}
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".csv,.tsv,.txt,.apkg,.colpkg,text/csv,text/plain"
              className="sr-only"
              disabled={status.step === "parsing"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="flex gap-3 p-4">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium">{t("import.csvTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("import.csvHelp")}</p>
              </div>
            </Card>
            <Card className="flex gap-3 p-4">
              <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium">{t("import.ankiTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("import.ankiHelp")}</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {(status.step === "map" || status.step === "importing") && source && (
        <div className="mt-10 space-y-8">
          <Card className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              {source.kind === "anki" ? (
                <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{source.fileName}</p>
                <p className="text-xs text-muted-foreground">{t("import.rowsFound", { count: rows.length, formatted: fmt(rows.length) })}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} disabled={status.step === "importing"}>
              <RefreshCw />
              {t("import.chooseAnother")}
            </Button>
          </Card>

          <section className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight">{t("import.mapTitle")}</h2>
            {source.kind === "anki" && source.types.length > 1 && (
              <Field label={t("import.noteType")} htmlFor="note-type">
                <Select
                  id="note-type"
                  value={source.typeId}
                  onChange={(e) => {
                    const type = source.types.find((ty) => ty.id === e.target.value)!;
                    setSource({ ...source, typeId: type.id });
                    setMapping({ front: 0, back: type.fields.length > 1 ? 1 : 0, example: NONE });
                  }}
                >
                  {source.types.map((ty) => (
                    <option key={ty.id} value={ty.id}>
                      {t("import.noteTypeOption", { name: ty.name, count: ty.notes.length, formatted: fmt(ty.notes.length) })}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {source.kind === "csv" && (
              <Checkbox
                label={t("import.hasHeader")}
                checked={source.hasHeader}
                onChange={(e) => {
                  const hasHeader = e.target.checked;
                  setSource({ ...source, hasHeader });
                  setMapping(guessColumns(hasHeader ? source.table.rows[0] : undefined, source.table.columnCount));
                }}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {(["front", "back", "example"] as const).map((role) => (
                <Field key={role} label={t(`import.roles.${role}`)} htmlFor={`map-${role}`}>
                  <Select
                    id={`map-${role}`}
                    value={mapping[role]}
                    onChange={(e) => setMapping({ ...mapping, [role]: Number(e.target.value) })}
                  >
                    {role === "example" && <option value={NONE}>{t("import.none")}</option>}
                    {columns.map((c, i) => (
                      <option key={i} value={i}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">{t("import.previewTitle")}</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t("import.roles.front")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("import.roles.back")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("import.roles.example")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cards.slice(0, PREVIEW_ROWS).map((c, i) => (
                    <tr key={i}>
                      <td className="max-w-48 truncate px-4 py-2.5 font-medium">{c.front}</td>
                      <td className="max-w-48 truncate px-4 py-2.5">{c.back}</td>
                      <td className="max-w-48 truncate px-4 py-2.5 text-muted-foreground">{c.example}</td>
                    </tr>
                  ))}
                  {cards.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                        {t("import.noValidRows")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > cards.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("import.rowsIgnored", { count: rows.length - cards.length, formatted: fmt(rows.length - cards.length) })}
              </p>
            )}
          </section>

          <section className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight">{t("import.destinationTitle")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("import.deck")} htmlFor="target-deck">
                <Select id="target-deck" value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)}>
                  <option value="new">{t("import.newDeck")}</option>
                  {decks.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {targetDeck === "new" && (
                <Field label={t("deck.name")} htmlFor="new-deck-name">
                  <Input
                    id="new-deck-name"
                    maxLength={LIMITS.deckName}
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <Checkbox
              label={t("import.skipDuplicates")}
              hint={t("import.skipDuplicatesHint")}
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
            />
          </section>

          <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            {status.step === "importing" ? (
              <div className="flex-1 space-y-2">
                <Progress value={status.done / status.total} label={t("import.importing")} />
                <p className="text-xs text-muted-foreground">
                  {t("import.progress", { done: fmt(status.done), total: fmt(status.total) })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("import.ready", { count: cards.length, formatted: fmt(cards.length) })}
              </p>
            )}
            <Button size="lg" onClick={() => void runImport()} loading={status.step === "importing"} disabled={cards.length === 0}>
              {t("import.importButton", { count: cards.length, formatted: fmt(cards.length) })}
            </Button>
          </div>
        </div>
      )}

      {status.step === "finished" && (
        <Card className="mt-10 flex flex-col items-center p-10 text-center">
          <CheckCircle2 className="size-10 text-review" aria-hidden />
          <h2 className="mt-4 text-xl font-semibold tracking-tight">{t("import.doneTitle")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t("import.doneCreated", { count: status.created, formatted: fmt(status.created) })}
            {status.skipped > 0 && ` ${t("import.doneSkipped", { count: status.skipped, formatted: fmt(status.skipped) })}`}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              {t("import.importMore")}
            </Button>
            <Link to={`/decks/${status.deckId}`} className={buttonClass("primary")}>
              {t("import.openDeck")}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
