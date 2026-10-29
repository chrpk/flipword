import { unzipSync } from "fflate";
import { decompress } from "fzstd";
import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { ankiFieldToText } from "./text";

export interface AnkiNoteType {
  id: string;
  name: string;
  fields: string[];
  /** Each note's fields, already converted to plain text. */
  notes: string[][];
}

export class AnkiImportError extends Error {
  readonly code: "invalid" | "empty";

  constructor(code: "invalid" | "empty") {
    super(code);
    this.code = code;
  }
}

/** Newer Anki exports contain a zstd-compressed `.anki21b`; older ones a plain SQLite file. */
const COLLECTION_FILES = ["collection.anki21b", "collection.anki21", "collection.anki2"];

function readCollection(files: Record<string, Uint8Array>) {
  for (const name of COLLECTION_FILES) {
    const data = files[name];
    if (data) return name.endsWith("b") ? decompress(data) : data;
  }
  throw new AnkiImportError("invalid");
}

function query<T extends unknown[]>(db: Database, sql: string): T[] {
  const [result] = db.exec(sql);
  return (result?.values ?? []) as T[];
}

function tableExists(db: Database, name: string) {
  return query(db, `select name from sqlite_master where type = 'table' and name = '${name}'`).length > 0;
}

function noteTypes(db: Database): Map<string, { name: string; fields: string[] }> {
  const types = new Map<string, { name: string; fields: string[] }>();
  if (tableExists(db, "notetypes") && tableExists(db, "fields")) {
    for (const [id, name] of query<[number | string, string]>(db, "select id, name from notetypes")) {
      types.set(String(id), { name, fields: [] });
    }
    for (const [ntid, name] of query<[number | string, string]>(db, "select ntid, name from fields order by ntid, ord")) {
      types.get(String(ntid))?.fields.push(name);
    }
    if (types.size > 0) return types;
  }
  const [row] = query<[string]>(db, "select models from col");
  if (row?.[0]) {
    const models = JSON.parse(row[0]) as Record<string, { name: string; flds: { name: string; ord: number }[] }>;
    for (const [id, m] of Object.entries(models)) {
      types.set(id, { name: m.name, fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name) });
    }
  }
  return types;
}

export async function parseAnkiPackage(buffer: ArrayBuffer): Promise<AnkiNoteType[]> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (f) => COLLECTION_FILES.includes(f.name),
    });
  } catch {
    throw new AnkiImportError("invalid");
  }

  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let db: Database;
  try {
    db = new SQL.Database(readCollection(files));
  } catch (e) {
    if (e instanceof AnkiImportError) throw e;
    throw new AnkiImportError("invalid");
  }

  try {
    const types = noteTypes(db);
    const byType = new Map<string, AnkiNoteType>();
    for (const [mid, flds] of query<[number | string, string]>(db, "select mid, flds from notes order by id")) {
      const id = String(mid);
      let entry = byType.get(id);
      if (!entry) {
        const type = types.get(id);
        const fieldCount = flds.split("\x1f").length;
        entry = {
          id,
          name: type?.name ?? `Note type ${id}`,
          fields: type?.fields.length ? type.fields : Array.from({ length: fieldCount }, (_, i) => `Field ${i + 1}`),
          notes: [],
        };
        byType.set(id, entry);
      }
      entry.notes.push(flds.split("\x1f").map(ankiFieldToText));
    }
    const result = [...byType.values()].filter((t) => t.notes.length > 0).sort((a, b) => b.notes.length - a.notes.length);
    if (result.length === 0) throw new AnkiImportError("empty");
    return result;
  } catch (e) {
    if (e instanceof AnkiImportError) throw e;
    throw new AnkiImportError("invalid");
  } finally {
    db.close();
  }
}
