import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openSqliteBetter } from "../../node/driverBetterSqlite";
import { migrar, MIGRACOES, SCHEMA_VERSION, fileVersion } from "./esquema";
import { repositoryContract, ev, syntheticMatch } from "./repositorio.contrato";
import type { Repository } from "./repositorio";
import { MemoryRepository } from "./repositorioMemoria";
import { SqliteRepository } from "./repositorioSqlite";

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
    r.appendEvent(ev("FIM_EPOCA", { season, date: `${2026 + season}-05-31`, entities: [{ k: "competition", id: "PL" }] }));
  }
}

describe("esquema e migrações", () => {
  it("cria o esquema à primeira abertura", () => {
    const d = openSqliteBetter();
    expect(fileVersion(d)).toBe(0);
    new SqliteRepository(d);
    expect(fileVersion(d)).toBe(SCHEMA_VERSION);
  });

  it("migra um save antigo preservando os dados", () => {
    const V1 = MIGRACOES.slice(0, 1);
    const d1 = openSqliteBetter();
    migrar(d1, V1);
    d1.run("INSERT INTO evento (tipo, v, data, epoca, vis, dados) VALUES ('ANTIGO', 1, '2026-08-15', 1, 0, '{}')");
    const extra = "ALTER TABLE jogo ADD COLUMN meteo TEXT; CREATE TABLE extra (x INTEGER);";
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: 1, para: MIGRACOES.length + 1 });
    expect(fileVersion(d1)).toBe(MIGRACOES.length + 1);
    expect(d1.all("SELECT tipo FROM evento").map((l) => l.tipo)).toEqual(["ANTIGO"]);
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: MIGRACOES.length + 1, para: MIGRACOES.length + 1 }); // idempotente
  });

  it("v5: migra as posições antigas (portuguesas) para inglês", () => {
    const d = openSqliteBetter();
    migrar(d, MIGRACOES.slice(0, 4));
    d.run("INSERT INTO pessoa (id, nome, nome_desportivo, nascimento, nacionalidade, papeis, personalidade, arquetipo, lod) VALUES ('p1', 'A', 'A', '2000-01-01', 'PT', '[]', '{}', 'x', 1)");
    d.run(`INSERT INTO jogador (pessoa, posicoes, atributos, potencial, altura, peso, pe, estado) VALUES ('p1', '[{"pos":"EE","aptidao":20},{"pos":"MDC","aptidao":12},{"pos":"PL","aptidao":8}]', '{}', 10, 180, 70, 'D', 'ativo')`);
    migrar(d);
    expect(d.all("SELECT posicoes FROM jogador")[0]?.posicoes).toBe('[{"pos":"LW","aptidao":20},{"pos":"DM","aptidao":12},{"pos":"ST","aptidao":8}]');
  });

  it("v1 → v2: acrescenta as tabelas do calendário sem tocar na história", () => {
    const d = openSqliteBetter();
    migrar(d, MIGRACOES.slice(0, 1));
    d.run("INSERT INTO evento (tipo, v, data, epoca, vis, dados) VALUES ('ANTIGO', 1, '2026-08-15', 1, 0, '{}')");
    expect(d.all("SELECT name FROM sqlite_master WHERE name = 'calendario_jogo'")).toEqual([]);
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
  it("não aceita UPDATE nem DELETE em eventos, jogos, factos, participações e ajustes", () => {
    const d = openSqliteBetter();
    const r = new SqliteRepository(d);
    r.appendEvent(ev("X", { entities: [{ k: "club", id: "c1" }] }));
    const j = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 1, awayGoals: 0 });
    r.recordMatch(j.match, j.facts, j.part);
    r.adjustStandings({ competition: "PL", season: 1, club: "A", points: -1, event: 1 });
    for (const sql of [
      "UPDATE evento SET tipo = 'Y'", "DELETE FROM evento",
      "UPDATE evento_entidade SET id = 'z'", "DELETE FROM evento_entidade",
      "UPDATE jogo SET golos_casa = 9", "DELETE FROM jogo",
      "UPDATE jogo_facto SET minuto = 1", "DELETE FROM jogo_facto",
      "UPDATE participacao SET minutos = 1", "DELETE FROM participacao",
      "UPDATE classificacao_ajuste SET pontos = 0", "DELETE FROM classificacao_ajuste",
    ])
      expect(() => d.run(sql), sql).toThrow(/imutável/);
  });

  it("as chaves estrangeiras estão ativas", () => {
    const d = openSqliteBetter();
    new SqliteRepository(d);
    expect(() => d.run("INSERT INTO evento (tipo, data, epoca, vis, causa, dados) VALUES ('X','2026-01-01',1,0,77,'{}')")).toThrow(/FOREIGN KEY/);
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
      r.appendEvent(ev("PERSISTE"));
      r.close();
      const r2 = new SqliteRepository(openSqliteBetter(f));
      expect(r2.count("PERSISTE")).toBe(1);
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
    const results = n("SELECT SUM(golos_casa + golos_fora) AS n FROM jogo");
    const gFacts = n("SELECT COUNT(*) AS n FROM jogo_facto WHERE tipo = 'G'");
    const goalsAuto = n("SELECT COUNT(*) AS n FROM jogo_facto WHERE tipo = 'G' AND extra = 'auto'");
    const statsG = n("SELECT SUM(golos) AS n FROM stat_jogador_epoca");
    expect(gFacts).toBe(results);
    expect(statsG).toBe(results - goalsAuto);
    expect(n("SELECT COUNT(*) AS n FROM jogo")).toBe(SEASONS * 56);
    expect(n("SELECT COUNT(*) AS n FROM classificacao WHERE jogos <> 14")).toBe(0);
  });

  it("FIM_EPOCA existe em todas as épocas e nenhum evento fica órfão", () => {
    for (let e = 1; e <= SEASONS; e++) expect(sqlite.count("FIM_EPOCA", { k: "competition", id: "PL" }, { seasonSince: e, untilSeason: e })).toBe(1);
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
