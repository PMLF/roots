/**
 * Driver Node (testes, harness de calibração, ferramentas). Fica fora de src/engine de propósito:
 * o motor não conhece bibliotecas nativas.
 */
import Database from "better-sqlite3";
import type { DriverSql, LinhaSql, ValorSql } from "../engine/persistencia/driver";

export function abrirBetterSqlite(caminho: string | Uint8Array = ":memory:"): DriverSql {
  const db = typeof caminho === "string" ? new Database(caminho) : new Database(Buffer.from(caminho));
  db.pragma("foreign_keys = ON");
  if (typeof caminho === "string" && caminho !== ":memory:") db.pragma("journal_mode = WAL");
  const cache = new Map<string, Database.Statement>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  return {
    executarScript: (sql) => void db.exec(sql),
    executar(sql, params = []) {
      const r = stmt(sql).run(...params);
      return { alteradas: r.changes, ultimoId: Number(r.lastInsertRowid) };
    },
    todos: (sql, params = []) => stmt(sql).all(...params) as LinhaSql[],
    exportar: () => new Uint8Array(db.serialize()),
    fechar: () => void db.close(),
  };
}

export type { ValorSql };
