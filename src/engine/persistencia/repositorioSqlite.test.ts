import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { abrirBetterSqlite } from "../../node/driverBetterSqlite";
import { migrar, MIGRACOES, VERSAO_ESQUEMA, versaoDoFicheiro } from "./esquema";
import { contratoRepositorio, ev, jogoSintetico } from "./repositorio.contrato";
import type { Repositorio } from "./repositorio";
import { RepositorioMemoria } from "./repositorioMemoria";
import { RepositorioSqlite } from "./repositorioSqlite";

contratoRepositorio("SQLite", () => new RepositorioSqlite(abrirBetterSqlite()));

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
function simular(r: Repositorio, epocas: number, seed = 7): void {
  const rand = rng(seed);
  const clubes = ["A", "B", "C", "D", "E", "F", "G", "H"];
  r.definirMeta("seed", String(seed));
  for (let epoca = 1; epoca <= epocas; epoca++) {
    let jornada = 0;
    for (let volta = 0; volta < 2; volta++)
      for (let rodada = 0; rodada < 7; rodada++) {
        jornada++;
        for (let i = 0; i < 4; i++) {
          const x = (rodada + i) % 7;
          const par: [string, string] = i === 0 ? [clubes[7] as string, clubes[rodada] as string] : [clubes[(rodada + i) % 7] as string, clubes[(rodada - i + 7) % 7] as string];
          void x;
          const [casa, fora] = volta === 0 ? par : [par[1], par[0]];
          const j = jogoSintetico(
            `e${epoca}-j${jornada}-${i}`,
            { casa, fora, golosCasa: Math.floor(rand() * 4), golosFora: Math.floor(rand() * 3), epoca, jornada, data: `${2026 + epoca}-0${(jornada % 9) + 1}-15` },
            { cartoes: rand() < 0.4, autoGolo: rand() < 0.1 },
          );
          r.registarJogo(j.jogo, j.factos, j.part);
        }
      }
    r.acrescentarEvento(ev("FIM_EPOCA", { epoca, data: `${2026 + epoca}-05-31`, entidades: [{ k: "competicao", id: "PL" }] }));
  }
}

describe("esquema e migrações", () => {
  it("cria o esquema à primeira abertura", () => {
    const d = abrirBetterSqlite();
    expect(versaoDoFicheiro(d)).toBe(0);
    new RepositorioSqlite(d);
    expect(versaoDoFicheiro(d)).toBe(VERSAO_ESQUEMA);
  });

  it("migra um save antigo preservando os dados", () => {
    const V1 = MIGRACOES.slice(0, 1);
    const d1 = abrirBetterSqlite();
    migrar(d1, V1);
    d1.executar("INSERT INTO evento (tipo, v, data, epoca, vis, dados) VALUES ('ANTIGO', 1, '2026-08-15', 1, 0, '{}')");
    const extra = "ALTER TABLE jogo ADD COLUMN meteo TEXT; CREATE TABLE extra (x INTEGER);";
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: 1, para: MIGRACOES.length + 1 });
    expect(versaoDoFicheiro(d1)).toBe(MIGRACOES.length + 1);
    expect(d1.todos("SELECT tipo FROM evento").map((l) => l.tipo)).toEqual(["ANTIGO"]);
    expect(migrar(d1, [...MIGRACOES, extra])).toEqual({ de: MIGRACOES.length + 1, para: MIGRACOES.length + 1 }); // idempotente
  });

  it("v5: migra as posições antigas (portuguesas) para inglês", () => {
    const d = abrirBetterSqlite();
    migrar(d, MIGRACOES.slice(0, 4));
    d.executar("INSERT INTO pessoa (id, nome, nome_desportivo, nascimento, nacionalidade, papeis, personalidade, arquetipo, lod) VALUES ('p1', 'A', 'A', '2000-01-01', 'PT', '[]', '{}', 'x', 1)");
    d.executar(`INSERT INTO jogador (pessoa, posicoes, atributos, potencial, altura, peso, pe, estado) VALUES ('p1', '[{"pos":"EE","aptidao":20},{"pos":"MDC","aptidao":12},{"pos":"PL","aptidao":8}]', '{}', 10, 180, 70, 'D', 'ativo')`);
    migrar(d);
    expect(d.todos("SELECT posicoes FROM jogador")[0]?.posicoes).toBe('[{"pos":"LW","aptidao":20},{"pos":"DM","aptidao":12},{"pos":"ST","aptidao":8}]');
  });

  it("v1 → v2: acrescenta as tabelas do calendário sem tocar na história", () => {
    const d = abrirBetterSqlite();
    migrar(d, MIGRACOES.slice(0, 1));
    d.executar("INSERT INTO evento (tipo, v, data, epoca, vis, dados) VALUES ('ANTIGO', 1, '2026-08-15', 1, 0, '{}')");
    expect(d.todos("SELECT name FROM sqlite_master WHERE name = 'calendario_jogo'")).toEqual([]);
    const r = new RepositorioSqlite(d);
    expect(versaoDoFicheiro(d)).toBe(VERSAO_ESQUEMA);
    expect(r.totalEventos()).toBe(1);
    r.guardarCalendario([{ id: "a", competicao: "SL", epoca: 1, jornada: 1, data: "2026-08-22", casa: "X", fora: "Y" }], []);
    expect(r.calendarioDoClube("X", 1)).toHaveLength(1);
  });

  it("uma migração que falha não deixa a base a meio", () => {
    const d = abrirBetterSqlite();
    migrar(d);
    const n = MIGRACOES.length;
    expect(() => migrar(d, [...MIGRACOES, "CREATE TABLE ok (x INTEGER); CREATE TABLE ok (y INTEGER);"])).toThrow(new RegExp(`versão ${n + 1} falhou`));
    expect(versaoDoFicheiro(d)).toBe(n);
    expect(d.todos("SELECT name FROM sqlite_master WHERE name = 'ok'")).toEqual([]);
  });

  it("recusa saves de uma versão mais recente do que o motor", () => {
    const d = abrirBetterSqlite();
    d.executarScript("PRAGMA user_version = 99");
    expect(() => new RepositorioSqlite(d)).toThrow(/mais recente/);
  });
});

describe("história imutável", () => {
  it("não aceita UPDATE nem DELETE em eventos, jogos, factos, participações e ajustes", () => {
    const d = abrirBetterSqlite();
    const r = new RepositorioSqlite(d);
    r.acrescentarEvento(ev("X", { entidades: [{ k: "clube", id: "c1" }] }));
    const j = jogoSintetico("j1", { casa: "A", fora: "B", golosCasa: 1, golosFora: 0 });
    r.registarJogo(j.jogo, j.factos, j.part);
    r.ajustarClassificacao({ competicao: "PL", epoca: 1, clube: "A", pontos: -1, evento: 1 });
    for (const sql of [
      "UPDATE evento SET tipo = 'Y'", "DELETE FROM evento",
      "UPDATE evento_entidade SET id = 'z'", "DELETE FROM evento_entidade",
      "UPDATE jogo SET golos_casa = 9", "DELETE FROM jogo",
      "UPDATE jogo_facto SET minuto = 1", "DELETE FROM jogo_facto",
      "UPDATE participacao SET minutos = 1", "DELETE FROM participacao",
      "UPDATE classificacao_ajuste SET pontos = 0", "DELETE FROM classificacao_ajuste",
    ])
      expect(() => d.executar(sql), sql).toThrow(/imutável/);
  });

  it("as chaves estrangeiras estão ativas", () => {
    const d = abrirBetterSqlite();
    new RepositorioSqlite(d);
    expect(() => d.executar("INSERT INTO evento (tipo, data, epoca, vis, causa, dados) VALUES ('X','2026-01-01',1,0,77,'{}')")).toThrow(/FOREIGN KEY/);
  });
});

describe("persistência em ficheiro e exportação", () => {
  it("um save exportado reabre com a mesma história", () => {
    const r = new RepositorioSqlite(abrirBetterSqlite());
    simular(r, 2);
    const bytes = r.exportarSqlite();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const r2 = new RepositorioSqlite(abrirBetterSqlite(bytes));
    expect(r2.exportarNdjson()).toBe(r.exportarNdjson());
    expect(r2.classificacao("PL", 2)).toEqual(r.classificacao("PL", 2));
    expect(r2.meta("seed")).toBe("7");
  });

  it("guarda em disco e reabre", () => {
    const pasta = mkdtempSync(join(tmpdir(), "raizes-"));
    try {
      const f = join(pasta, "save.sqlite");
      const d = abrirBetterSqlite(f);
      const r = new RepositorioSqlite(d);
      r.acrescentarEvento(ev("PERSISTE"));
      r.fechar();
      const r2 = new RepositorioSqlite(abrirBetterSqlite(f));
      expect(r2.contar("PERSISTE")).toBe(1);
      r2.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe("50 épocas (critérios de aceitação de HISTORICO_EVENTOS §9)", () => {
  const EPOCAS = 50;
  const sqlite = new RepositorioSqlite(abrirBetterSqlite());
  const memoria = new RepositorioMemoria();
  simular(sqlite, EPOCAS);
  simular(memoria, EPOCAS);

  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  };

  it("mesma seed → mesmo log (hash igual), e igual entre adaptadores", () => {
    const outro = new RepositorioSqlite(abrirBetterSqlite());
    simular(outro, EPOCAS);
    expect(hash(outro.exportarNdjson())).toBe(hash(sqlite.exportarNdjson()));
    expect(memoria.exportarNdjson()).toBe(sqlite.exportarNdjson());
    const diferente = new RepositorioSqlite(abrirBetterSqlite());
    simular(diferente, 2, 8);
    const igual = new RepositorioSqlite(abrirBetterSqlite());
    simular(igual, 2, 7);
    expect(hash(diferente.exportarNdjson())).not.toBe(hash(igual.exportarNdjson()));
  });

  it("reconstruir as derivadas do zero dá linhas iguais às guardadas", () => {
    const antes = (r: Repositorio) => Array.from({ length: EPOCAS }, (_, i) => r.classificacao("PL", i + 1)).concat(["A", "B", "H"].flatMap((c) => [1, 3, 8, 9].map((p) => r.statsJogador(`${c}-${p}`))) as never);
    for (const r of [sqlite, memoria]) {
      const a = antes(r);
      r.reconstruirDerivadas();
      expect(antes(r)).toEqual(a);
    }
    expect(antes(sqlite)).toEqual(antes(memoria));
  });

  it("golos: estatísticas de jogadores = golos em factos = resultados", () => {
    const d = abrirBetterSqlite(sqlite.exportarSqlite());
    const n = (sql: string) => Number(d.todos(sql)[0]?.n);
    const resultados = n("SELECT SUM(golos_casa + golos_fora) AS n FROM jogo");
    const factosG = n("SELECT COUNT(*) AS n FROM jogo_facto WHERE tipo = 'G'");
    const autoGolos = n("SELECT COUNT(*) AS n FROM jogo_facto WHERE tipo = 'G' AND extra = 'auto'");
    const statsG = n("SELECT SUM(golos) AS n FROM stat_jogador_epoca");
    expect(factosG).toBe(resultados);
    expect(statsG).toBe(resultados - autoGolos);
    expect(n("SELECT COUNT(*) AS n FROM jogo")).toBe(EPOCAS * 56);
    expect(n("SELECT COUNT(*) AS n FROM classificacao WHERE jogos <> 14")).toBe(0);
  });

  it("FIM_EPOCA existe em todas as épocas e nenhum evento fica órfão", () => {
    for (let e = 1; e <= EPOCAS; e++) expect(sqlite.contar("FIM_EPOCA", { k: "competicao", id: "PL" }, { desdeEpoca: e, ateEpoca: e })).toBe(1);
    const d = abrirBetterSqlite(sqlite.exportarSqlite());
    expect(d.todos("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("consultas da história continuam rápidas depois de 50 épocas", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      sqlite.eventosDe({ k: "clube", id: "A" }, { apenasPublicos: true, limite: 50 });
      sqlite.statsJogador("A-9");
      sqlite.classificacao("PL", 1 + (i % EPOCAS));
      sqlite.marcadores("PL", 10, 5);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
