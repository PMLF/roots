/**
 * Esquema e migrações (RZ-128). `PRAGMA user_version` = nº de migrações aplicadas.
 * Regras: nunca editar uma migração já publicada; acrescentar uma nova. Os processos de vida longa
 * (contrato, promessa, obra, caso_corrupcao, sancao, memoria, relacao…) entram com as suas funcionalidades.
 */
import type { DriverSql } from "./driver";

const V1 = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE event (
  id      INTEGER PRIMARY KEY,
  type    TEXT    NOT NULL,
  v       INTEGER NOT NULL DEFAULT 1,
  date    TEXT    NOT NULL,
  season   INTEGER NOT NULL,
  round INTEGER,
  visibility     INTEGER NOT NULL CHECK (visibility IN (0, 1, 2)),
  cause   INTEGER REFERENCES event(id),
  corrects INTEGER REFERENCES event(id),
  origin  TEXT    NOT NULL DEFAULT 'match' CHECK (origin IN ('match', 'generated')),
  data   TEXT    NOT NULL,
  CHECK (corrects IS NULL OR type = 'CORRECTION')
);
CREATE INDEX ix_event_type_season ON event(type, season);
CREATE INDEX ix_event_cause ON event(cause);

CREATE TABLE event_entity (
  k TEXT NOT NULL, id TEXT NOT NULL, event INTEGER NOT NULL REFERENCES event(id), role_kind TEXT,
  PRIMARY KEY (k, id, event)
) WITHOUT ROWID;
CREATE INDEX ix_event_entidade_event ON event_entity(event);

CREATE TABLE match (
  id TEXT PRIMARY KEY, competition TEXT NOT NULL, season INTEGER NOT NULL, round INTEGER NOT NULL, date TEXT NOT NULL,
  home TEXT NOT NULL, away TEXT NOT NULL, home_goals INTEGER NOT NULL, away_goals INTEGER NOT NULL,
  home_xg REAL NOT NULL DEFAULT 0, away_xg REAL NOT NULL DEFAULT 0, home_possession REAL NOT NULL DEFAULT 0.5,
  attendance INTEGER NOT NULL DEFAULT 0, revenue INTEGER NOT NULL DEFAULT 0, importance REAL NOT NULL DEFAULT 0,
  referee TEXT NOT NULL DEFAULT '', event INTEGER NOT NULL REFERENCES event(id)
);
CREATE INDEX ix_match_round ON match(competition, season, round);
CREATE INDEX ix_match_home ON match(home, season);
CREATE INDEX ix_match_away ON match(away, season);

CREATE TABLE match_fact (
  match TEXT NOT NULL REFERENCES match(id), minute INTEGER NOT NULL, type TEXT NOT NULL,
  player TEXT NOT NULL, club TEXT NOT NULL, extra TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_fact_match ON match_fact(match);
CREATE INDEX ix_fact_player ON match_fact(player, type);

CREATE TABLE appearance (
  match TEXT NOT NULL REFERENCES match(id), player TEXT NOT NULL, club TEXT NOT NULL,
  starter INTEGER NOT NULL, minutes INTEGER NOT NULL, rating REAL,
  PRIMARY KEY (match, player)
) WITHOUT ROWID;
CREATE INDEX ix_appearance_player ON appearance(player);

CREATE TABLE standings_adjustment (
  competition TEXT NOT NULL, season INTEGER NOT NULL, club TEXT NOT NULL, points INTEGER NOT NULL,
  event INTEGER NOT NULL REFERENCES event(id)
);
CREATE INDEX ix_adjustment ON standings_adjustment(competition, season);

-- Derivadas (reconstruíveis a partir de match, match_fact, appearance e standings_adjustment)
CREATE TABLE standings (
  competition TEXT NOT NULL, season INTEGER NOT NULL, club TEXT NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0, goals_for INTEGER NOT NULL DEFAULT 0, goals_against INTEGER NOT NULL DEFAULT 0,
  match_points INTEGER NOT NULL DEFAULT 0, adjustment INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (competition, season, club)
) WITHOUT ROWID;

CREATE TABLE player_season_stat (
  player TEXT NOT NULL, season INTEGER NOT NULL, club TEXT NOT NULL, competition TEXT NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0, minutes INTEGER NOT NULL DEFAULT 0, goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0, yellows INTEGER NOT NULL DEFAULT 0, reds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, season, club, competition)
) WITHOUT ROWID;

CREATE TABLE observation (
  id INTEGER PRIMARY KEY, observer TEXT NOT NULL, target_k TEXT NOT NULL, target_id TEXT NOT NULL,
  group_name TEXT NOT NULL, values_json TEXT NOT NULL, quality REAL NOT NULL, source TEXT NOT NULL,
  date TEXT NOT NULL, season INTEGER NOT NULL
);
CREATE INDEX ix_observation ON observation(observer, target_k, target_id, group_name);

-- História immutable: nada se altera nem se apaga.
CREATE TRIGGER event_no_update BEFORE UPDATE ON event BEGIN SELECT RAISE(ABORT, 'event is immutable'); END;
CREATE TRIGGER event_no_delete BEFORE DELETE ON event BEGIN SELECT RAISE(ABORT, 'event is immutable'); END;
CREATE TRIGGER event_entidade_no_update BEFORE UPDATE ON event_entity BEGIN SELECT RAISE(ABORT, 'event is immutable'); END;
CREATE TRIGGER event_entidade_no_delete BEFORE DELETE ON event_entity BEGIN SELECT RAISE(ABORT, 'event is immutable'); END;
CREATE TRIGGER match_no_update BEFORE UPDATE ON match BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER match_no_delete BEFORE DELETE ON match BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER match_facto_no_update BEFORE UPDATE ON match_fact BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER match_facto_no_delete BEFORE DELETE ON match_fact BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER appearance_no_update BEFORE UPDATE ON appearance BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER appearance_no_delete BEFORE DELETE ON appearance BEGIN SELECT RAISE(ABORT, 'match is immutable'); END;
CREATE TRIGGER adjustment_no_update BEFORE UPDATE ON standings_adjustment BEGIN SELECT RAISE(ABORT, 'adjustment is immutable'); END;
CREATE TRIGGER adjustment_no_delete BEFORE DELETE ON standings_adjustment BEGIN SELECT RAISE(ABORT, 'adjustment is immutable'); END;
`;

const V2 = `
-- Calendário (RZ-102): matches marcados e folgas. Ao jogar-se, o match entra em \`match\` com o mesmo id.
CREATE TABLE scheduled_match (
  id TEXT PRIMARY KEY, competition TEXT NOT NULL, season INTEGER NOT NULL, round INTEGER NOT NULL, date TEXT NOT NULL,
  home TEXT NOT NULL, away TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX ix_cal_round ON scheduled_match(competition, season, round);
CREATE INDEX ix_cal_home ON scheduled_match(home, season, date);
CREATE INDEX ix_cal_away ON scheduled_match(away, season, date);
CREATE TABLE scheduled_bye (
  competition TEXT NOT NULL, season INTEGER NOT NULL, round INTEGER NOT NULL, club TEXT NOT NULL,
  PRIMARY KEY (competition, season, round)
) WITHOUT ROWID;
`;

const V3 = `
-- Pessoas geradas (RZ-103). personality, attributes e potential são "verdade oculta": a Vista não os lê.
CREATE TABLE person (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sporting_name TEXT NOT NULL, birth TEXT NOT NULL,
  nationality TEXT NOT NULL, native_of TEXT, roles TEXT NOT NULL, personality TEXT NOT NULL,
  archetype TEXT NOT NULL, lod INTEGER NOT NULL CHECK (lod IN (1, 2, 3))
) WITHOUT ROWID;
CREATE INDEX ix_person_name ON person(sporting_name);
CREATE TABLE player (
  person TEXT PRIMARY KEY REFERENCES person(id), positions TEXT NOT NULL, attributes TEXT NOT NULL, potential REAL NOT NULL,
  height INTEGER NOT NULL, weight INTEGER NOT NULL, foot TEXT NOT NULL, club TEXT, state TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX ix_player_club ON player(club);
CREATE TABLE contract (
  id INTEGER PRIMARY KEY, person TEXT NOT NULL REFERENCES person(id), club TEXT NOT NULL,
  monthly_wage INTEGER NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL
);
CREATE INDEX ix_contract_person ON contract(person);
CREATE INDEX ix_contract_club ON contract(club);
CREATE TABLE role (
  person TEXT PRIMARY KEY REFERENCES person(id), role_function TEXT NOT NULL, club TEXT, city TEXT, quality TEXT
) WITHOUT ROWID;
CREATE INDEX ix_role_club ON role(club);
CREATE INDEX ix_role_city ON role(city);
`;

const V4 = `
-- Localidades (RZ-136): village, town ou city dentro de um concelho. Estado atual; a história de mudanças de
-- status está nos eventos LOCALITY_STATUS (entidade 'locality'). Os data de origin vêm de date/localities.csv.
CREATE TABLE locality (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, population INTEGER NOT NULL CHECK (population >= 0),
  status TEXT NOT NULL CHECK (status IN ('village', 'town', 'city')), since TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX ix_locality_city ON locality(city);
`;


const V5 = `
-- Competições a eliminar (RZ-140): jogos com vencedor obrigatório, campo neutro, segunda mão, prolongamento e penáltis.
ALTER TABLE scheduled_match ADD COLUMN knockout INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_match ADD COLUMN neutral INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_match ADD COLUMN venue TEXT;
ALTER TABLE scheduled_match ADD COLUMN first_leg TEXT;
ALTER TABLE match ADD COLUMN extra_time INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match ADD COLUMN home_penalties INTEGER;
ALTER TABLE match ADD COLUMN away_penalties INTEGER;
`;

/** A posição no array + 1 é o número da versão do esquema. */
export const MIGRATIONS: readonly string[] = [V1, V2, V3, V4, V5];
export const SCHEMA_VERSION = MIGRATIONS.length;

export function fileVersion(d: DriverSql): number {
  return Number(d.all("PRAGMA user_version")[0]?.user_version ?? 0);
}

/**
 * Leva a base de dados até à última versão, uma migração por transação.
 * Recusa ficheiros de uma versão mais recente do que o motor conhece.
 */
export function migrate(d: DriverSql, migrations: readonly string[] = MIGRATIONS): { from: number; to: number } {
  d.runScript("PRAGMA foreign_keys = ON");
  const from = fileVersion(d);
  if (from > migrations.length) throw new Error(`Save da versão ${from}, mais recente do que este motor (${migrations.length}).`);
  for (let v = from; v < migrations.length; v++) {
    d.runScript("BEGIN");
    try {
      d.runScript(migrations[v] as string);
      d.runScript(`PRAGMA user_version = ${v + 1}`);
      d.runScript("COMMIT");
    } catch (e) {
      d.runScript("ROLLBACK");
      throw new Error(`Migração para a versão ${v + 1} falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { from, to: migrations.length };
}
