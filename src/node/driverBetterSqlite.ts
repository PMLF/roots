/**
 * Driver Node (testes, harness de calibração, ferramentas). Fica fora de src/engine de propósito:
 * o motor não conhece bibliotecas nativas.
 */
import Database from "better-sqlite3";
import type { DriverSql, SqlLine, SqlValue } from "../engine/persistence/driver";

export function openSqliteBetter(path: string | Uint8Array = ":memory:"): DriverSql {
  const db = typeof path === "string" ? new Database(path) : new Database(Buffer.from(path));
  db.pragma("foreign_keys = ON");
  if (typeof path === "string" && path !== ":memory:") db.pragma("journal_mode = WAL");
  const cache = new Map<string, Database.Statement>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  return {
    runScript: (sql) => void db.exec(sql),
    run(sql, params = []) {
      const r = stmt(sql).run(...params);
      return { changed: r.changes, lastId: Number(r.lastInsertRowid) };
    },
    all: (sql, params = []) => stmt(sql).all(...params) as SqlLine[],
    exported: () => new Uint8Array(db.serialize()),
    close: () => void db.close(),
  };
}

export type { SqlValue };
