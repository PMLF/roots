import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parametros";
import { importData } from "../dados/importar";
import type { BaseData } from "../dados/tipos";
import { MemoryRepository } from "../persistencia/repositorioMemoria";
import { drawLotsIncidents } from "./acontecimentos";
import { evolveCities, cityHistory } from "./cidades";
import { cityTargets, initialState, levelOf, trendOf } from "./estado";
import { evolveCity, WITHOUT_RESULTS } from "./evolucao";

const read = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const r = importData({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts") });
if (!r.ok) throw new Error(r.errors.slice(0, 5).join("\n"));
const data: BaseData = r.data;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("cidade: estado de arranque", () => {
  it("os parâmetros são válidos", () => {
    expect(validateParameters(P)).toEqual([]);
  });

  it("é determinístico e fica entre 0 e 100", () => {
    const c = data.cities[0]!;
    const a = initialState(c, data.clubs, new Rng("s", "city").derive(`inicial:${c.id}`), P);
    const b = initialState(c, data.clubs, new Rng("s", "city").derive(`inicial:${c.id}`), P);
    expect(a).toEqual(b);
    expect(a.population).toBe(c.population);
    for (const k of ["employment", "economy", "tourism", "pride", "notoriety", "footballCulture"] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThanOrEqual(100);
    }
  });

  it("o setor conta: o turismo é maior nas cidades de turismo do que nas do interior", () => {
    const tur = data.cities.filter((c) => c.sector === "TUR").map((c) => cityTargets(c, data.clubs, P).tourism);
    const inte = data.cities.filter((c) => c.sector === "INT").map((c) => cityTargets(c, data.clubs, P).tourism);
    expect(mean(tur)).toBeGreaterThan(mean(inte) + 20);
  });

  it("o melhor clube da terra puxa o orgulho", () => {
    const porRep = data.cities
      .map((c) => ({ rep: Math.max(...data.clubs.filter((x) => x.city === c.id).map((x) => x.reputation), 0), o: cityTargets(c, data.clubs, P).pride }))
      .sort((a, b) => a.rep - b.rep);
    const half = Math.floor(porRep.length / 2);
    expect(mean(porRep.slice(half).map((x) => x.o))).toBeGreaterThan(mean(porRep.slice(0, half).map((x) => x.o)));
  });

  it("os níveis e as tendências saem dos cortes", () => {
    expect([0, 19.9, 20, 45, 60, 80, 100].map((v) => levelOf(v, P))).toEqual([1, 1, 2, 3, 4, 5, 5]);
    expect(trendOf(40, 45, P)).toBe("rises");
    expect(trendOf(45, 40, P)).toBe("drops");
    expect(trendOf(40, 42, P)).toBe("stable");
    expect(trendOf(undefined, 42, P)).toBe("stable");
  });
});

describe("cidade: evolução anual", () => {
  const c = data.cities.find((x) => x.clubs.length > 0)!;
  const before = initialState(c, data.clubs, new Rng("s").derive("x"), P);
  const targets = cityTargets(c, data.clubs, P);
  const input = { targets, driftPopulationPct: 0, results: WITHOUT_RESULTS, effects: [] };

  it("um título e uma subida sobem o orgulho; uma descida baixa-o", () => {
    const med = (result: typeof WITHOUT_RESULTS) => mean(Array.from({ length: 200 }, (_, i) => evolveCity(before, { ...input, results: result }, new Rng("t", String(i)), P).pride));
    const base = med(WITHOUT_RESULTS);
    expect(med({ champions: 1, promotions: 0, relegations: 0 })).toBeGreaterThan(base + 3);
    expect(med({ champions: 0, promotions: 0, relegations: 1 })).toBeLessThan(base - 3);
  });

  it("um fecho de fábrica tira emprego e população", () => {
    const f = P.city.events.types.fabrica_fecha.effects;
    const using = evolveCity(before, { ...input, effects: [f] }, new Rng("t", "1"), P);
    const without = evolveCity(before, input, new Rng("t", "1"), P);
    expect(using.employment).toBeLessThan(without.employment - 8);
    expect(using.population).toBeLessThan(without.population);
  });

  it("a população nunca muda mais do que o máximo anual e os indicadores ficam em 0-100", () => {
    let e = before;
    for (let i = 0; i < 60; i++) {
      const p = e.population;
      e = evolveCity(e, { ...input, effects: [P.city.events.types.fabrica_abre.effects, P.city.events.types.fundos_europeus.effects] }, new Rng("t", String(i)), P);
      expect(Math.abs(e.population / p - 1) * 100).toBeLessThanOrEqual(P.city.evolution.population.maxPct + 0.01);
      for (const k of ["employment", "economy", "tourism", "pride", "notoriety"] as const) {
        expect(e[k]).toBeGreaterThanOrEqual(0);
        expect(e[k]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("cidade: acontecimentos", () => {
  it("são determinísticos e os regionais atingem todo o polo", () => {
    const a = drawLotsIncidents(data.cities, new Rng("s").derive("e1"), P);
    expect(drawLotsIncidents(data.cities, new Rng("s").derive("e1"), P)).toEqual(a);
    for (const x of a.filter((y) => y.regional)) {
      expect(x.cities).toEqual(data.cities.filter((c) => c.hub === x.hub).map((c) => c.id).sort());
    }
    for (const x of a.filter((y) => !y.regional)) expect(x.cities).toHaveLength(1);
  });

  it("acontecem a um ritmo razoável e todos os tipos aparecem ao longo de muitas épocas", () => {
    const all = Array.from({ length: 40 }, (_, i) => drawLotsIncidents(data.cities, new Rng("s").derive(`e${i}`), P));
    const bySeason = mean(all.map((x) => x.filter((y) => !y.regional).length));
    expect(bySeason).toBeGreaterThan(data.cities.length * P.city.events.cityProb * 0.6);
    expect(bySeason).toBeLessThan(data.cities.length * P.city.events.cityProb * 1.2);
    const types = new Set(all.flat().map((y) => y.type));
    expect(types.size).toBe(Object.keys(P.city.events.types).length);
  });

  it("as fábricas fecham sobretudo nas cidades industriais", () => {
    const all = Array.from({ length: 60 }, (_, i) => drawLotsIncidents(data.cities, new Rng("s").derive(`e${i}`), P)).flat().filter((x) => x.type === "fabrica_fecha");
    const ind = new Set(data.cities.filter((c) => c.sector === "IND").map((c) => c.id));
    const industrialN = all.filter((x) => ind.has(x.cities[0]!)).length;
    // 39 de 276 cidades são industriais (14 %), mas devem ter bem mais de 14 % dos fechos
    expect(industrialN / all.length).toBeGreaterThan(0.3);
  });
});

describe("cidade: no save", () => {
  it("guarda um estado novo por cidade e por época e os acontecimentos públicos", () => {
    const repo = new MemoryRepository();
    repo.setMeta("seed", "teste");
    const city = data.cities[3]!;
    expect(cityHistory(repo, data, P, city.id)).toHaveLength(1);
    const result = new Map([[city.id, { champions: 1, promotions: 0, relegations: 0 }]]);
    evolveCities(repo, data, P, 1, "2027-06-30", result);
    evolveCities(repo, data, P, 2, "2028-06-30", new Map());
    const h = cityHistory(repo, data, P, city.id);
    expect(h.map((x) => x.season)).toEqual([1, 2, 3]);
    expect(repo.count("CIDADE_EPOCA")).toBe(data.cities.length * 2);
    // os números verdadeiros são privados; só os acontecimentos são públicos
    expect(repo.recentEvents({ types: ["CIDADE_EPOCA"], publicOnly: true })).toHaveLength(0);
    for (const e of repo.recentEvents({ types: ["CIDADE_EVENTO"], publicOnly: true })) expect(e.visibility).toBe("exposed");
  });

  it("é reconstruível: a mesma seed dá o mesmo caminho", () => {
    const runs = () => {
      const repo = new MemoryRepository();
      repo.setMeta("seed", "equal");
      for (let ep = 1; ep <= 3; ep++) evolveCities(repo, data, P, ep, `${2026 + ep}-06-30`, new Map());
      return cityHistory(repo, data, P, data.cities[10]!.id);
    };
    expect(runs()).toEqual(runs());
  });
});

describe("cidade: textos", () => {
  const texts = (f: string) => JSON.parse(readFileSync(new URL(`../../ui/i18n/${f}.json`, import.meta.url), "utf-8")) as Record<string, string>;
  for (const f of ["pt-PT", "en"]) {
    it(`${f} tem as frases de todos os acontecimentos, setores e níveis`, () => {
      const t = texts(f);
      for (const type of Object.keys(P.city.events.types)) for (const k of [`cidade.acontecimento.${type}`, `noticia.cidade.${type}.1.titulo`, `noticia.cidade.${type}.1.corpo`]) expect(t[k], k).toBeTruthy();
      for (const sector of [...new Set([...data.cities.flatMap((c) => [c.sector, c.tag2]), ...Object.keys(P.city.sectors)])].filter(Boolean)) for (const k of [`setor.${sector}`, `sinergia.${sector}`]) expect(t[k], k).toBeTruthy();
      for (let i = 1; i <= 5; i++) expect(t[`cidade.nivel.${i}`]).toBeTruthy();
    });
  }
});
