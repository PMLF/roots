/// <reference lib="webworker" />
/**
 * Driver do browser: sqlite-wasm dentro do worker. Guarda no OPFS (VFS `opfs-sahpool`, que não exige
 * cabeçalhos COOP/COEP) e, se o OPFS não estiver disponível, numa base em memória (sem persistência).
 * É a única parte do projeto que conhece o `@sqlite.org/sqlite-wasm`.
 */
import type { Database, PreparedStatement, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { DriverSql, SqlLine, SqlValue } from "../persistence/driver";

// O Next substitui process.env.NEXT_PUBLIC_* no build; o worker não tem os tipos do Node.
declare const process: { env: { NEXT_PUBLIC_BASE_PATH?: string } };

type DbBackend = "opfs" | "memory";
export type IsOpenDb = { driver: DriverSql; backend: DbBackend; sqliteVersion: string; memoryReason?: string };

let module: Promise<Sqlite3Static> | undefined;

/** URL de public/sqlite/index.mjs, respeitando o basePath (tools/copy-sqlite-wasm.mjs copia-o para lá). */
function urlSqlite(): string {
  return publicUrl("sqlite/index.mjs");
}

/** URL de um ficheiro de `public/`, respeitando o basePath. */
export function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${self.location.origin}${base}/${path}`;
}

const sqlite = () =>
  (module ??= (async () => {
    // Carregado por URL, fora do bundler (ver tools/copy-sqlite-wasm.mjs).
    const m = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ urlSqlite())) as { default: () => Promise<Sqlite3Static> };
    return m.default();
  })());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Instala o VFS no OPFS. Pode demorar uns instantes a obter o bloqueio se outro worker acabou de sair. */
async function installOpfs(s: Sqlite3Static, name: string) {
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await s.installOpfsSAHPoolVfs({ name: `raizes-${name}`, initialCapacity: 12 });
    } catch (e) {
      last = e;
      await wait(150 * (i + 1));
    }
  }
  throw last;
}

/** Exportado para testar o mesmo código em Node (sqlite-wasm em memória) com a bateria do Repositorio. */
export function involve(s: Sqlite3Static, db: Database): DriverSql {
  const cache = new Map<string, PreparedStatement>();
  const prepare = (sql: string): PreparedStatement => {
    let st = cache.get(sql);
    if (!st) cache.set(sql, (st = db.prepare(sql)));
    return st;
  };
  return {
    runScript: (sql) => void db.exec(sql),
    run(sql, params = []) {
      const st = prepare(sql);
      try {
        if (params.length > 0) st.bind(params as SqlValue[]);
        st.step();
      } finally {
        st.reset(true);
      }
      return { changed: db.changes(), lastId: Number(s.capi.sqlite3_last_insert_rowid(db)) };
    },
    all(sql, params = []) {
      const st = prepare(sql);
      const lines: SqlLine[] = [];
      try {
        if (params.length > 0) st.bind(params as SqlValue[]);
        while (st.step()) lines.push(st.get({}) as SqlLine);
      } finally {
        st.reset(true);
      }
      return lines;
    },
    exported: () => new Uint8Array(s.capi.sqlite3_js_db_export(db)),
    close() {
      for (const st of cache.values()) st.finalize();
      cache.clear();
      db.close();
    },
  };
}

/** Abre (ou cria) o save `nome`. Com `bytes` importa um ficheiro .sqlite exportado antes. */
export async function openWasm(name: string, options: { bytes?: Uint8Array; memoryOnly?: boolean } = {}): Promise<IsOpenDb> {
  const s = await sqlite();
  const sqliteVersion = s.version.libVersion;
  let memoryReason: string | undefined;
  if (!options.memoryOnly) {
    try {
      const pool = await installOpfs(s, "saves");
      const file = `/${name}.sqlite3`;
      if (options.bytes) await pool.importDb(file, options.bytes);
      const db = new pool.OpfsSAHPoolDb(file);
      db.exec("PRAGMA foreign_keys = ON; PRAGMA locking_mode = EXCLUSIVE; PRAGMA cache_size = -131072");
      return { driver: involve(s, db), backend: "opfs", sqliteVersion };
    } catch (e) {
      memoryReason = e instanceof Error ? e.message : String(e);
    }
  }
  const db = new s.oo1.DB(":memory:", "c");
  if (options.bytes) {
    const p = s.wasm.allocFromTypedArray(options.bytes);
    const rc = s.capi.sqlite3_deserialize(db, "main", p, options.bytes.byteLength, options.bytes.byteLength, s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE);
    if (rc !== 0) throw new Error(`Não foi possível importar o save (código ${rc})`);
  }
  db.exec("PRAGMA foreign_keys = ON");
  return { driver: involve(s, db), backend: "memory", sqliteVersion, ...(memoryReason !== undefined ? { memoryReason } : {}) };
}
