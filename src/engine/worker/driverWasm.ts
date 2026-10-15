/// <reference lib="webworker" />
/**
 * Driver do browser: sqlite-wasm dentro do worker. Guarda no OPFS (VFS `opfs-sahpool`, que não exige
 * cabeçalhos COOP/COEP) e, se o OPFS não estiver disponível, numa base em memória (sem persistência).
 * É a única parte do projeto que conhece o `@sqlite.org/sqlite-wasm`.
 */
import type { Database, PreparedStatement, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { DriverSql, LinhaSql, ValorSql } from "../persistencia/driver";

// O Next substitui process.env.NEXT_PUBLIC_* no build; o worker não tem os tipos do Node.
declare const process: { env: { NEXT_PUBLIC_BASE_PATH?: string } };

export type BackendBd = "opfs" | "memoria";
export type BdAberta = { driver: DriverSql; backend: BackendBd; versaoSqlite: string; motivoMemoria?: string };

let modulo: Promise<Sqlite3Static> | undefined;

/** URL de public/sqlite/index.mjs, respeitando o basePath (tools/copiar-sqlite-wasm.mjs copia-o para lá). */
export function urlSqlite(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${self.location.origin}${base}/sqlite/index.mjs`;
}

const sqlite = () =>
  (modulo ??= (async () => {
    // Carregado por URL, fora do bundler (ver tools/copiar-sqlite-wasm.mjs).
    const m = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ urlSqlite())) as { default: () => Promise<Sqlite3Static> };
    return m.default();
  })());

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Instala o VFS no OPFS. Pode demorar uns instantes a obter o bloqueio se outro worker acabou de sair. */
async function instalarOpfs(s: Sqlite3Static, nome: string) {
  let ultimo: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await s.installOpfsSAHPoolVfs({ name: `raizes-${nome}`, initialCapacity: 12 });
    } catch (e) {
      ultimo = e;
      await espera(150 * (i + 1));
    }
  }
  throw ultimo;
}

/** Exportado para testar o mesmo código em Node (sqlite-wasm em memória) com a bateria do Repositorio. */
export function envolver(s: Sqlite3Static, db: Database): DriverSql {
  const cache = new Map<string, PreparedStatement>();
  const prep = (sql: string): PreparedStatement => {
    let st = cache.get(sql);
    if (!st) cache.set(sql, (st = db.prepare(sql)));
    return st;
  };
  return {
    executarScript: (sql) => void db.exec(sql),
    executar(sql, params = []) {
      const st = prep(sql);
      try {
        if (params.length > 0) st.bind(params as ValorSql[]);
        st.step();
      } finally {
        st.reset(true);
      }
      return { alteradas: db.changes(), ultimoId: Number(s.capi.sqlite3_last_insert_rowid(db)) };
    },
    todos(sql, params = []) {
      const st = prep(sql);
      const linhas: LinhaSql[] = [];
      try {
        if (params.length > 0) st.bind(params as ValorSql[]);
        while (st.step()) linhas.push(st.get({}) as LinhaSql);
      } finally {
        st.reset(true);
      }
      return linhas;
    },
    exportar: () => new Uint8Array(s.capi.sqlite3_js_db_export(db)),
    fechar() {
      for (const st of cache.values()) st.finalize();
      cache.clear();
      db.close();
    },
  };
}

/** Abre (ou cria) o save `nome`. Com `bytes` importa um ficheiro .sqlite exportado antes. */
export async function abrirWasm(nome: string, opcoes: { bytes?: Uint8Array; apenasMemoria?: boolean } = {}): Promise<BdAberta> {
  const s = await sqlite();
  const versaoSqlite = s.version.libVersion;
  let motivoMemoria: string | undefined;
  if (!opcoes.apenasMemoria) {
    try {
      const pool = await instalarOpfs(s, "saves");
      const ficheiro = `/${nome}.sqlite3`;
      if (opcoes.bytes) await pool.importDb(ficheiro, opcoes.bytes);
      const db = new pool.OpfsSAHPoolDb(ficheiro);
      db.exec("PRAGMA foreign_keys = ON");
      return { driver: envolver(s, db), backend: "opfs", versaoSqlite };
    } catch (e) {
      motivoMemoria = e instanceof Error ? e.message : String(e);
    }
  }
  const db = new s.oo1.DB(":memory:", "c");
  if (opcoes.bytes) {
    const p = s.wasm.allocFromTypedArray(opcoes.bytes);
    const rc = s.capi.sqlite3_deserialize(db, "main", p, opcoes.bytes.byteLength, opcoes.bytes.byteLength, s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE);
    if (rc !== 0) throw new Error(`Não foi possível importar o save (código ${rc})`);
  }
  db.exec("PRAGMA foreign_keys = ON");
  return { driver: envolver(s, db), backend: "memoria", versaoSqlite, ...(motivoMemoria !== undefined ? { motivoMemoria } : {}) };
}
