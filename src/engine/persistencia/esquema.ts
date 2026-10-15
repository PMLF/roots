/**
 * Esquema e migrações (RZ-128). `PRAGMA user_version` = nº de migrações aplicadas.
 * Regras: nunca editar uma migração já publicada; acrescentar uma nova. Os processos de vida longa
 * (contrato, promessa, obra, caso_corrupcao, sancao, memoria, relacao…) entram com as suas funcionalidades.
 */
import type { DriverSql } from "./driver";

const V1 = `
CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE evento (
  id      INTEGER PRIMARY KEY,
  tipo    TEXT    NOT NULL,
  v       INTEGER NOT NULL DEFAULT 1,
  data    TEXT    NOT NULL,
  epoca   INTEGER NOT NULL,
  jornada INTEGER,
  vis     INTEGER NOT NULL CHECK (vis IN (0, 1, 2)),
  causa   INTEGER REFERENCES evento(id),
  corrige INTEGER REFERENCES evento(id),
  origem  TEXT    NOT NULL DEFAULT 'jogo' CHECK (origem IN ('jogo', 'gerado')),
  dados   TEXT    NOT NULL,
  CHECK (corrige IS NULL OR tipo = 'CORRECAO')
);
CREATE INDEX ix_evento_tipo_epoca ON evento(tipo, epoca);
CREATE INDEX ix_evento_causa ON evento(causa);

CREATE TABLE evento_entidade (
  k TEXT NOT NULL, id TEXT NOT NULL, evento INTEGER NOT NULL REFERENCES evento(id), papel TEXT,
  PRIMARY KEY (k, id, evento)
) WITHOUT ROWID;
CREATE INDEX ix_evento_entidade_evento ON evento_entidade(evento);

CREATE TABLE jogo (
  id TEXT PRIMARY KEY, competicao TEXT NOT NULL, epoca INTEGER NOT NULL, jornada INTEGER NOT NULL, data TEXT NOT NULL,
  casa TEXT NOT NULL, fora TEXT NOT NULL, golos_casa INTEGER NOT NULL, golos_fora INTEGER NOT NULL,
  xg_casa REAL NOT NULL DEFAULT 0, xg_fora REAL NOT NULL DEFAULT 0, posse_casa REAL NOT NULL DEFAULT 0.5,
  assistencia INTEGER NOT NULL DEFAULT 0, receita INTEGER NOT NULL DEFAULT 0, importancia REAL NOT NULL DEFAULT 0,
  arbitro TEXT NOT NULL DEFAULT '', evento INTEGER NOT NULL REFERENCES evento(id)
);
CREATE INDEX ix_jogo_jornada ON jogo(competicao, epoca, jornada);
CREATE INDEX ix_jogo_casa ON jogo(casa, epoca);
CREATE INDEX ix_jogo_fora ON jogo(fora, epoca);

CREATE TABLE jogo_facto (
  jogo TEXT NOT NULL REFERENCES jogo(id), minuto INTEGER NOT NULL, tipo TEXT NOT NULL,
  jogador TEXT NOT NULL, clube TEXT NOT NULL, extra TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_facto_jogo ON jogo_facto(jogo);
CREATE INDEX ix_facto_jogador ON jogo_facto(jogador, tipo);

CREATE TABLE participacao (
  jogo TEXT NOT NULL REFERENCES jogo(id), jogador TEXT NOT NULL, clube TEXT NOT NULL,
  titular INTEGER NOT NULL, minutos INTEGER NOT NULL, nota REAL,
  PRIMARY KEY (jogo, jogador)
) WITHOUT ROWID;
CREATE INDEX ix_participacao_jogador ON participacao(jogador);

CREATE TABLE classificacao_ajuste (
  competicao TEXT NOT NULL, epoca INTEGER NOT NULL, clube TEXT NOT NULL, pontos INTEGER NOT NULL,
  evento INTEGER NOT NULL REFERENCES evento(id)
);
CREATE INDEX ix_ajuste ON classificacao_ajuste(competicao, epoca);

-- Derivadas (reconstruíveis a partir de jogo, jogo_facto, participacao e classificacao_ajuste)
CREATE TABLE classificacao (
  competicao TEXT NOT NULL, epoca INTEGER NOT NULL, clube TEXT NOT NULL,
  jogos INTEGER NOT NULL DEFAULT 0, vitorias INTEGER NOT NULL DEFAULT 0, empates INTEGER NOT NULL DEFAULT 0,
  derrotas INTEGER NOT NULL DEFAULT 0, gm INTEGER NOT NULL DEFAULT 0, gs INTEGER NOT NULL DEFAULT 0,
  pontos_jogos INTEGER NOT NULL DEFAULT 0, ajuste INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (competicao, epoca, clube)
) WITHOUT ROWID;

CREATE TABLE stat_jogador_epoca (
  jogador TEXT NOT NULL, epoca INTEGER NOT NULL, clube TEXT NOT NULL, competicao TEXT NOT NULL,
  jogos INTEGER NOT NULL DEFAULT 0, minutos INTEGER NOT NULL DEFAULT 0, golos INTEGER NOT NULL DEFAULT 0,
  assistencias INTEGER NOT NULL DEFAULT 0, amarelos INTEGER NOT NULL DEFAULT 0, vermelhos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (jogador, epoca, clube, competicao)
) WITHOUT ROWID;

CREATE TABLE observacao (
  id INTEGER PRIMARY KEY, observador TEXT NOT NULL, alvo_k TEXT NOT NULL, alvo_id TEXT NOT NULL,
  grupo TEXT NOT NULL, valores TEXT NOT NULL, qualidade REAL NOT NULL, fonte TEXT NOT NULL,
  data TEXT NOT NULL, epoca INTEGER NOT NULL
);
CREATE INDEX ix_observacao ON observacao(observador, alvo_k, alvo_id, grupo);

-- História imutável: nada se altera nem se apaga.
CREATE TRIGGER evento_sem_update BEFORE UPDATE ON evento BEGIN SELECT RAISE(ABORT, 'evento é imutável'); END;
CREATE TRIGGER evento_sem_delete BEFORE DELETE ON evento BEGIN SELECT RAISE(ABORT, 'evento é imutável'); END;
CREATE TRIGGER evento_entidade_sem_update BEFORE UPDATE ON evento_entidade BEGIN SELECT RAISE(ABORT, 'evento é imutável'); END;
CREATE TRIGGER evento_entidade_sem_delete BEFORE DELETE ON evento_entidade BEGIN SELECT RAISE(ABORT, 'evento é imutável'); END;
CREATE TRIGGER jogo_sem_update BEFORE UPDATE ON jogo BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER jogo_sem_delete BEFORE DELETE ON jogo BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER jogo_facto_sem_update BEFORE UPDATE ON jogo_facto BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER jogo_facto_sem_delete BEFORE DELETE ON jogo_facto BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER participacao_sem_update BEFORE UPDATE ON participacao BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER participacao_sem_delete BEFORE DELETE ON participacao BEGIN SELECT RAISE(ABORT, 'jogo é imutável'); END;
CREATE TRIGGER ajuste_sem_update BEFORE UPDATE ON classificacao_ajuste BEGIN SELECT RAISE(ABORT, 'ajuste é imutável'); END;
CREATE TRIGGER ajuste_sem_delete BEFORE DELETE ON classificacao_ajuste BEGIN SELECT RAISE(ABORT, 'ajuste é imutável'); END;
`;

/** A posição no array + 1 é o número da versão do esquema. */
export const MIGRACOES: readonly string[] = [V1];
export const VERSAO_ESQUEMA = MIGRACOES.length;

export function versaoDoFicheiro(d: DriverSql): number {
  return Number(d.todos("PRAGMA user_version")[0]?.user_version ?? 0);
}

/**
 * Leva a base de dados até à última versão, uma migração por transação.
 * Recusa ficheiros de uma versão mais recente do que o motor conhece.
 */
export function migrar(d: DriverSql, migracoes: readonly string[] = MIGRACOES): { de: number; para: number } {
  d.executarScript("PRAGMA foreign_keys = ON");
  const de = versaoDoFicheiro(d);
  if (de > migracoes.length) throw new Error(`Save da versão ${de}, mais recente do que este motor (${migracoes.length}).`);
  for (let v = de; v < migracoes.length; v++) {
    d.executarScript("BEGIN");
    try {
      d.executarScript(migracoes[v] as string);
      d.executarScript(`PRAGMA user_version = ${v + 1}`);
      d.executarScript("COMMIT");
    } catch (e) {
      d.executarScript("ROLLBACK");
      throw new Error(`Migração para a versão ${v + 1} falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { de, para: migracoes.length };
}
