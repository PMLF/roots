/**
 * Contrato mínimo que um motor SQLite tem de cumprir (better-sqlite3 em Node, sqlite-wasm no browser).
 * Síncrono. As transações são geridas pelo RepositorioSqlite com SAVEPOINTs, por isso o driver
 * só executa SQL.
 */
export type ValorSql = string | number | null;
export type LinhaSql = Record<string, ValorSql>;

export interface DriverSql {
  /** Executa um ou mais comandos sem parâmetros (esquema, PRAGMA, BEGIN/COMMIT). */
  executarScript(sql: string): void;
  /** Executa um comando com parâmetros posicionais (?). */
  executar(sql: string, params?: readonly ValorSql[]): { alteradas: number; ultimoId: number };
  todos(sql: string, params?: readonly ValorSql[]): LinhaSql[];
  /** Cópia serializada da base de dados (ficheiro .sqlite completo). */
  exportar(): Uint8Array;
  fechar(): void;
}
