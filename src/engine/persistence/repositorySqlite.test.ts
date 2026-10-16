import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openSqliteBetter } from "../../node/driverBetterSqlite";
import { migrar, MIGRACOES, SCHEMA_VERSION, fileVersion } from "./schema";
import { repositoryContract, ev, syntheticMatch } from "./repository.contract";
import type { Repository } from "./repository";
import { MemoryRepository } from "./repositoryMemory";
import { SqliteRepository } from "./repositorySqlite";

repositoryContract("SQLite", () => new SqliteRepository(openSqliteBetter()));

/** Gerador determinístico (mulberry32) para simular épocas sem depender do motor. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simula `epocas` épocas de uma liga de 8 clubes (ida e volta) e escreve tudo no repositório. */
function simulate(r: Repository, seasons: number, seed = 7): void {
  const rand = rng(seed);
  const clubs = ["A", "B", "C", "D", "E", "F", "G", "H"];
  r.setMeta("seed", String(seed));
  for (let season = 1; season <= seasons; season++) {
    let round = 0;
    for (let leg = 0; leg < 2; leg++)
      for (let turn = 0; turn < 7; turn++) {
        round++;
        for (let i = 0; i < 4; i++) {
          const x = (turn + i) % 7;
          const pair: [string, string] = i === 0 ? [clubs[7] as string, clubs[turn] as string] : [clubs[(turn + i) % 7] as string, clubs[(turn - i + 7) % 7] as string];
          void x;
          const [home, away] = leg === 0 ? pair : [pair[1], pair[0]];
          const j = syntheticMatch(
            `e${season}-j${round}-${i}`,
            { home, away, homeGoals: Math.floor(rand() * 4), awayGoals: Math.floor(rand() * 3), season, round, date: `${2026 + season}-0${(round % 9) + 1}-15` },
            { cards: rand() < 0.4, goalAuto: rand() < 0.1 },
          );
          r.recordMatch(j.match, j.facts, j.part);
        }
      }
    r.appendEvent(ev("SEASON_END", { season, date: `${2026 + season}-05-31`, entities: [{ k: "competition", id: "PL" }] }));
  }
}

describe("esquema e migrações", () => {
  it("cria o esquema à primeira abertura", () => {
    const d = openSqliteBetter();
    expect(fileVersion(d)).toBe(0);
    new SqliteRepository(d);
    expect(fileVersion(d)).toBe(SCHEMA_VERSION);
  });

  it("migra um save antigo preservando os data", () => {
    const V1 = MIGRACOES.slice(0, 1);
    const d1 = openSqliteBetter();
    migrar(d1, V1);
    d1.run("INSERT INTO event (type, v, date, season, visibility, data) VALUES ('OLD', 1, '2026-08-15', 1, 0, '{}')");
    const extra = "ALTER TABLE match ADD COLUMN meteo TEXT; CREATE TABLE extra (x INTEGER);";
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: 1, para: MIGRACOES.length + 1 });
    expect(fileVersion(d1)).toBe(MIGRACOES.length + 1);
    expect(d1.all("SELECT type FROM event").map((l) => l.type)).toEqual(["OLD"]);
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: MIGRACOES.length + 1, para: MIGRACOES.length + 1 }); // idempotente
  });

  it("v5: migra as posições antigas (portuguesas) para inglês", () => {
    const d = openSqliteBetter();
    migrar(d, MIGRACOES.slice(0, 4));
    d.run("INSERT INTO person (id, name, sporting_name, birth, nationality, roles, personality, archetype, lod) VALUES ('p1', 'A', 'A', '2000-01-01', 'PT', '[]', '{}', 'x', 1)");
    d.run(`INSERT INTO player (person, positions, attributes, potential, height, weight, foot, state) VALUES ('p1', '[{"pos":"EE","aptitude":20},{"pos":"MDC","aptitude":12},{"pos":"PL","aptitude":8}]', '{}', 10, 180, 70, 'D', 'active')`);
    migrar(d);
    expect(d.all("SELECT positions FROM player")[0]?.positions).toBe('[{"pos":"LW","aptitude":20},{"pos":"DM","aptitude":12},{"pos":"ST","aptitude":8}]');
  });

  it("v1 → v2: acrescenta as tabelas do calendário sem tocar na história", () => {
    const d = openSqliteBetter();
    migrar(d, MIGRACOES.slice(0, 1));
    d.run("INSERT INTO event (type, v, date, season, visibility, data) VALUES ('OLD', 1, '2026-08-15', 1, 0, '{}')");
    expect(d.all("SELECT name FROM sqlite_master WHERE name = 'scheduled_match'")).toEqual([]);
    const r = new SqliteRepository(d);
    expect(fileVersion(d)).toBe(SCHEMA_VERSION);
    expect(r.eventsTotal()).toBe(1);
    r.saveCalendar([{ id: "a", competition: "SL", season: 1, round: 1, date: "2026-08-22", home: "X", away: "Y" }], []);
    expect(r.clubCalendar("X", 1)).toHaveLength(1);
  });

  it("uma migração que falha não deixa a base a meio", () => {
    const d = openSqliteBetter();
    migrar(d);
    const n = MIGRACOES.length;
    expect(() => migrar(d, [...MIGRACOES, "CREATE TABLE ok (x INTEGER); CREATE TABLE ok (y INTEGER);"])).toThrow(new RegExp(`versão ${n + 1} falhou`));
    expect(fileVersion(d)).toBe(n);
    expect(d.all("SELECT name FROM sqlite_master WHERE name = 'ok'")).toEqual([]);
  });

  it("recusa saves de uma versão mais recente do que o motor", () => {
    const d = openSqliteBetter();
    d.runScript("PRAGMA user_version = 99");
    expect(() => new SqliteRepository(d)).toThrow(/mais recente/);
  });
});

describe("história imutável", () => {
  it("não aceita UPDATE nem DELETE em eventos, matches, factos, participações e ajustes", () => {
    const d = openSqliteBetter();
    const r = new SqliteRepository(d);
    r.appendEvent(ev("X", { entities: [{ k: "club", id: "c1" }] }));
    const j = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 1, awayGoals: 0 });
    r.recordMatch(j.match, j.facts, j.part);
    r.adjustStandings({ competition: "PL", season: 1, club: "A", points: -1, event: 1 });
    for (const sql of [
      "UPDATE event SET type = 'Y'", "DELETE FROM event",
      "UPDATE event_entity SET id = 'z'", "DELETE FROM event_entity",
      "UPDATE match SET home_goals = 9", "DELETE FROM match",
      "UPDATE match_fact SET minute = 1", "DELETE FROM match_fact",
      "UPDATE appearance SET minutes = 1", "DELETE FROM appearance",
      "UPDATE standings_adjustment SET points = 0", "DELETE FROM standings_adjustment",
    ])
      expect(() => d.run(sql), sql).toThrow(/immutable/);
  });

  it("as chaves estrangeiras estão ativas", () => {
    const d = openSqliteBetter();
    new SqliteRepository(d);
    expect(() => d.run("INSERT INTO event (type, date, season, visibility, cause, data) VALUES ('X','2026-01-01',1,0,77,'{}')")).toThrow(/FOREIGN KEY/);
  });
});

describe("persistência em ficheiro e exportação", () => {
  it("um save exportado reabre com a mesma história", () => {
    const r = new SqliteRepository(openSqliteBetter());
    simulate(r, 2);
    const bytes = r.exportSqlite();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const r2 = new SqliteRepository(openSqliteBetter(bytes));
    expect(r2.exportNdjson()).toBe(r.exportNdjson());
    expect(r2.standings("PL", 2)).toEqual(r.standings("PL", 2));
    expect(r2.meta("seed")).toBe("7");
  });

  it("guarda em disco e reabre", () => {
    const folder = mkdtempSync(join(tmpdir(), "raizes-"));
    try {
      const f = join(folder, "save.sqlite");
      const d = openSqliteBetter(f);
      const r = new SqliteRepository(d);
      r.appendEvent(ev("PERSISTS"));
      r.close();
      const r2 = new SqliteRepository(openSqliteBetter(f));
      expect(r2.count("PERSISTS")).toBe(1);
      r2.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("50 épocas (critérios de aceitação de HISTORICO_EVENTOS §9)", () => {
  const SEASONS = 50;
  const sqlite = new SqliteRepository(openSqliteBetter());
  const memory = new MemoryRepository();
  simulate(sqlite, SEASONS);
  simulate(memory, SEASONS);

  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  };

  it("mesma seed → mesmo log (hash igual), e igual entre adaptadores", () => {
    const other = new SqliteRepository(openSqliteBetter());
    simulate(other, SEASONS);
    expect(hash(other.exportNdjson())).toBe(hash(sqlite.exportNdjson()));
    expect(memory.exportNdjson()).toBe(sqlite.exportNdjson());
    const different = new SqliteRepository(openSqliteBetter());
    simulate(different, 2, 8);
    const equal = new SqliteRepository(openSqliteBetter());
    simulate(equal, 2, 7);
    expect(hash(different.exportNdjson())).not.toBe(hash(equal.exportNdjson()));
  });

  it("reconstruir as derivadas do zero dá linhas iguais às guardadas", () => {
    const before = (r: Repository) => Array.from({ length: SEASONS }, (_, i) => r.standings("PL", i + 1)).concat(["A", "B", "H"].flatMap((c) => [1, 3, 8, 9].map((p) => r.playerStats(`${c}-${p}`))) as never);
    for (const r of [sqlite, memory]) {
      const a = before(r);
      r.rebuildDerived();
      expect(before(r)).toEqual(a);
    }
    expect(before(sqlite)).toEqual(before(memory));
  });

  it("golos: estatísticas de jogadores = golos em factos = resultados", () => {
    const d = openSqliteBetter(sqlite.exportSqlite());
    const n = (sql: string) => Number(d.all(sql)[0]?.n);
    const results = n("SELECT SUM(home_goals + away_goals) AS n FROM match");
    const gFacts = n("SELECT COUNT(*) AS n FROM match_fact WHERE type = 'G'");
    const goalsAuto = n("SELECT COUNT(*) AS n FROM match_fact WHERE type = 'G' AND extra = 'auto'");
    const statsG = n("SELECT SUM(goals) AS n FROM player_season_stat");
    expect(gFacts).toBe(results);
    expect(statsG).toBe(results - goalsAuto);
    expect(n("SELECT COUNT(*) AS n FROM match")).toBe(SEASONS * 56);
    expect(n("SELECT COUNT(*) AS n FROM standings WHERE matches <> 14")).toBe(0);
  });

  it("FIM_EPOCA existe em todas as épocas e nenhum evento fica órfão", () => {
    for (let e = 1; e <= SEASONS; e++) expect(sqlite.count("SEASON_END", { k: "competition", id: "PL" }, { seasonSince: e, untilSeason: e })).toBe(1);
    const d = openSqliteBetter(sqlite.exportSqlite());
    expect(d.all("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("consultas da história continuam rápidas depois de 50 épocas", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      sqlite.eventsOf({ k: "club", id: "A" }, { publicOnly: true, limit: 50 });
      sqlite.playerStats("A-9");
      sqlite.standings("PL", 1 + (i % SEASONS));
      sqlite.scorers("PL", 10, 5);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
