import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { PARAMETROS_PADRAO as P, validarParametros } from "../config/parametros";
import { importarDados } from "../dados/importar";
import type { DadosBase } from "../dados/tipos";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { sortearAcontecimentos } from "./acontecimentos";
import { evoluirCidades, historicoDaCidade } from "./cidades";
import { alvosDaCidade, estadoInicial, nivelDe, tendenciaDe } from "./estado";
import { evoluirCidade, SEM_RESULTADOS } from "./evolucao";

const ler = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const r = importarDados({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos") });
if (!r.ok) throw new Error(r.erros.slice(0, 5).join("\n"));
const dados: DadosBase = r.dados;

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("cidade: estado de arranque", () => {
  it("os parâmetros são válidos", () => {
    expect(validarParametros(P)).toEqual([]);
  });

  it("é determinístico e fica entre 0 e 100", () => {
    const c = dados.cidades[0]!;
    const a = estadoInicial(c, dados.clubes, new Rng("s", "cidade").derivar(`inicial:${c.id}`), P);
    const b = estadoInicial(c, dados.clubes, new Rng("s", "cidade").derivar(`inicial:${c.id}`), P);
    expect(a).toEqual(b);
    expect(a.populacao).toBe(c.populacao);
    for (const k of ["emprego", "economia", "turismo", "orgulho", "notoriedade", "culturaFutebol"] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThanOrEqual(100);
    }
  });

  it("o setor conta: o turismo é maior nas cidades de turismo do que nas do interior", () => {
    const tur = dados.cidades.filter((c) => c.setor === "TUR").map((c) => alvosDaCidade(c, dados.clubes, P).turismo);
    const inte = dados.cidades.filter((c) => c.setor === "INT").map((c) => alvosDaCidade(c, dados.clubes, P).turismo);
    expect(media(tur)).toBeGreaterThan(media(inte) + 20);
  });

  it("o melhor clube da terra puxa o orgulho", () => {
    const porRep = dados.cidades
      .map((c) => ({ rep: Math.max(...dados.clubes.filter((x) => x.cidade === c.id).map((x) => x.reputacao), 0), o: alvosDaCidade(c, dados.clubes, P).orgulho }))
      .sort((a, b) => a.rep - b.rep);
    const metade = Math.floor(porRep.length / 2);
    expect(media(porRep.slice(metade).map((x) => x.o))).toBeGreaterThan(media(porRep.slice(0, metade).map((x) => x.o)));
  });

  it("os níveis e as tendências saem dos cortes", () => {
    expect([0, 19.9, 20, 45, 60, 80, 100].map((v) => nivelDe(v, P))).toEqual([1, 1, 2, 3, 4, 5, 5]);
    expect(tendenciaDe(40, 45, P)).toBe("sobe");
    expect(tendenciaDe(45, 40, P)).toBe("desce");
    expect(tendenciaDe(40, 42, P)).toBe("estavel");
    expect(tendenciaDe(undefined, 42, P)).toBe("estavel");
  });
});

describe("cidade: evolução anual", () => {
  const c = dados.cidades.find((x) => x.clubes.length > 0)!;
  const antes = estadoInicial(c, dados.clubes, new Rng("s").derivar("x"), P);
  const alvos = alvosDaCidade(c, dados.clubes, P);
  const entrada = { alvos, derivaPopulacaoPct: 0, resultados: SEM_RESULTADOS, efeitos: [] };

  it("um título e uma subida sobem o orgulho; uma descida baixa-o", () => {
    const med = (res: typeof SEM_RESULTADOS) => media(Array.from({ length: 200 }, (_, i) => evoluirCidade(antes, { ...entrada, resultados: res }, new Rng("t", String(i)), P).orgulho));
    const base = med(SEM_RESULTADOS);
    expect(med({ campeoes: 1, subidas: 0, descidas: 0 })).toBeGreaterThan(base + 3);
    expect(med({ campeoes: 0, subidas: 0, descidas: 1 })).toBeLessThan(base - 3);
  });

  it("um fecho de fábrica tira emprego e população", () => {
    const f = P.cidade.eventos.tipos.fabrica_fecha.efeitos;
    const com = evoluirCidade(antes, { ...entrada, efeitos: [f] }, new Rng("t", "1"), P);
    const sem = evoluirCidade(antes, entrada, new Rng("t", "1"), P);
    expect(com.emprego).toBeLessThan(sem.emprego - 8);
    expect(com.populacao).toBeLessThan(sem.populacao);
  });

  it("a população nunca muda mais do que o máximo anual e os indicadores ficam em 0-100", () => {
    let e = antes;
    for (let i = 0; i < 60; i++) {
      const p = e.populacao;
      e = evoluirCidade(e, { ...entrada, efeitos: [P.cidade.eventos.tipos.fabrica_abre.efeitos, P.cidade.eventos.tipos.fundos_europeus.efeitos] }, new Rng("t", String(i)), P);
      expect(Math.abs(e.populacao / p - 1) * 100).toBeLessThanOrEqual(P.cidade.evolucao.populacao.maxPct + 0.01);
      for (const k of ["emprego", "economia", "turismo", "orgulho", "notoriedade"] as const) {
        expect(e[k]).toBeGreaterThanOrEqual(0);
        expect(e[k]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("cidade: acontecimentos", () => {
  it("são determinísticos e os regionais atingem todo o polo", () => {
    const a = sortearAcontecimentos(dados.cidades, new Rng("s").derivar("e1"), P);
    expect(sortearAcontecimentos(dados.cidades, new Rng("s").derivar("e1"), P)).toEqual(a);
    for (const x of a.filter((y) => y.regional)) {
      expect(x.cidades).toEqual(dados.cidades.filter((c) => c.polo === x.polo).map((c) => c.id).sort());
    }
    for (const x of a.filter((y) => !y.regional)) expect(x.cidades).toHaveLength(1);
  });

  it("acontecem a um ritmo razoável e todos os tipos aparecem ao longo de muitas épocas", () => {
    const todos = Array.from({ length: 40 }, (_, i) => sortearAcontecimentos(dados.cidades, new Rng("s").derivar(`e${i}`), P));
    const porEpoca = media(todos.map((x) => x.filter((y) => !y.regional).length));
    expect(porEpoca).toBeGreaterThan(dados.cidades.length * P.cidade.eventos.probCidade * 0.6);
    expect(porEpoca).toBeLessThan(dados.cidades.length * P.cidade.eventos.probCidade * 1.2);
    const tipos = new Set(todos.flat().map((y) => y.tipo));
    expect(tipos.size).toBe(Object.keys(P.cidade.eventos.tipos).length);
  });

  it("as fábricas fecham sobretudo nas cidades industriais", () => {
    const todos = Array.from({ length: 60 }, (_, i) => sortearAcontecimentos(dados.cidades, new Rng("s").derivar(`e${i}`), P)).flat().filter((x) => x.tipo === "fabrica_fecha");
    const ind = new Set(dados.cidades.filter((c) => c.setor === "IND").map((c) => c.id));
    const nIndustriais = todos.filter((x) => ind.has(x.cidades[0]!)).length;
    // 39 de 276 cidades são industriais (14 %), mas devem ter bem mais de 14 % dos fechos
    expect(nIndustriais / todos.length).toBeGreaterThan(0.3);
  });
});

describe("cidade: no save", () => {
  it("guarda um estado novo por cidade e por época e os acontecimentos públicos", () => {
    const repo = new RepositorioMemoria();
    repo.definirMeta("seed", "teste");
    const cid = dados.cidades[3]!;
    expect(historicoDaCidade(repo, dados, P, cid.id)).toHaveLength(1);
    const res = new Map([[cid.id, { campeoes: 1, subidas: 0, descidas: 0 }]]);
    evoluirCidades(repo, dados, P, 1, "2027-06-30", res);
    evoluirCidades(repo, dados, P, 2, "2028-06-30", new Map());
    const h = historicoDaCidade(repo, dados, P, cid.id);
    expect(h.map((x) => x.epoca)).toEqual([1, 2, 3]);
    expect(repo.contar("CIDADE_EPOCA")).toBe(dados.cidades.length * 2);
    // os números verdadeiros são privados; só os acontecimentos são públicos
    expect(repo.eventosRecentes({ tipos: ["CIDADE_EPOCA"], apenasPublicos: true })).toHaveLength(0);
    for (const e of repo.eventosRecentes({ tipos: ["CIDADE_EVENTO"], apenasPublicos: true })) expect(e.vis).toBe("publico");
  });

  it("é reconstruível: a mesma seed dá o mesmo caminho", () => {
    const corre = () => {
      const repo = new RepositorioMemoria();
      repo.definirMeta("seed", "igual");
      for (let ep = 1; ep <= 3; ep++) evoluirCidades(repo, dados, P, ep, `${2026 + ep}-06-30`, new Map());
      return historicoDaCidade(repo, dados, P, dados.cidades[10]!.id);
    };
    expect(corre()).toEqual(corre());
  });
});

describe("cidade: textos", () => {
  const textos = (f: string) => JSON.parse(readFileSync(new URL(`../../ui/i18n/${f}.json`, import.meta.url), "utf-8")) as Record<string, string>;
  for (const f of ["pt-PT", "en"]) {
    it(`${f} tem as frases de todos os acontecimentos, setores e níveis`, () => {
      const t = textos(f);
      for (const tipo of Object.keys(P.cidade.eventos.tipos)) for (const k of [`cidade.acontecimento.${tipo}`, `noticia.cidade.${tipo}.1.titulo`, `noticia.cidade.${tipo}.1.corpo`]) expect(t[k], k).toBeTruthy();
      for (const setor of [...new Set([...dados.cidades.flatMap((c) => [c.setor, c.tag2]), ...Object.keys(P.cidade.setores)])].filter(Boolean)) for (const k of [`setor.${setor}`, `sinergia.${setor}`]) expect(t[k], k).toBeTruthy();
      for (let i = 1; i <= 5; i++) expect(t[`cidade.nivel.${i}`]).toBeTruthy();
    });
  }
});
