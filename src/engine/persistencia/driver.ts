/**
 * Contrato mínimo que um motor SQLite tem de cumprir (better-sqlite3 em Node, sqlite-wasm no browser).
 * Síncrono. As transações são geridas pelo RepositorioSqlite com SAVEPOINTs, por isso o driver
 * só executa SQL.
 */
export type SqlValue = string | number | null;
export type SqlLine = Record<string, SqlValue>;

export interface DriverSql {
  /** Executa um ou mais comandos sem parâmetros (esquema, PRAGMA, BEGIN/COMMIT). */
  runScript(sql: string): void;
  /** Executa um comando com parâmetros posicionais (?). */
  run(sql: string, params?: readonly SqlValue[]): { changed: number; lastId: number };
  all(sql: string, params?: readonly SqlValue[]): SqlLine[];
  /** Cópia serializada da base de dados (ficheiro .sqlite completo). */
  exported(): Uint8Array;
  close(): void;
}
