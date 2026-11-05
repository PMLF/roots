import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../random/rng";
import { CITY_SERVICES, DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import type { BaseData } from "../data/types";
import { attendanceFactor, nightlifeOf, recoveryFactor, wageFactor } from "./effects";
import { evolveCity, WITHOUT_RESULTS } from "./evolution";
import { budgetIndexes, cityTargets, initialState, serviceTarget, serviceTrendOf } from "./state";

const read = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const r = importData({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts") });
if (!r.ok) throw new Error(r.errors.slice(0, 5).join("\n"));
const data: BaseData = r.data;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const idx = budgetIndexes(data.cities);

describe("serviços da cidade (RZ-233)", () => {
  it("o estado de arranque tem os seis serviços entre 0 e 100", () => {
    for (const c of data.cities.slice(0, 30)) {
      const s = initialState(c, data.clubs, new Rng("s", "city").derive(`inicial:${c.id}`), P, idx.get(c.id));
      for (const id of CITY_SERVICES) { expect(s[id]).toBeGreaterThanOrEqual(0); expect(s[id]).toBeLessThanOrEqual(100); }
    }
  });

  it("o orçamento municipal por habitante vai de −1 a +1 e mexe nos alvos", () => {
    const values = [...idx.values()];
    expect(Math.min(...values)).toBe(-1);
    expect(Math.max(...values)).toBe(1);
    // a mesma cidade com mais orçamento tem alvos mais altos (a verba mantém as infraestruturas)
    const c = data.cities.find((x) => x.sector === "SER") ?? data.cities[0]!;
    for (const id of CITY_SERVICES) {
      expect(cityTargets(c, data.clubs, P, 1).services[id]).toBeGreaterThanOrEqual(cityTargets(c, data.clubs, P, -1).services[id]);
    }
    expect(cityTargets(c, data.clubs, P, 1).services.health).toBeGreaterThan(cityTargets(c, data.clubs, P, -1).services.health + 10);
  });

  it("as cidades grandes têm mais saúde e entretenimento e a habitação é menos acessível; o interior tem pior mobilidade", () => {
    const sorted = [...data.cities].sort((a, b) => a.population - b.population);
    const small = sorted.slice(0, 40), big = sorted.slice(-40);
    const avg = (cs: typeof small, id: (typeof CITY_SERVICES)[number]) => mean(cs.map((c) => cityTargets(c, data.clubs, P).services[id]));
    expect(avg(big, "health")).toBeGreaterThan(avg(small, "health"));
    expect(avg(big, "entertainment")).toBeGreaterThan(avg(small, "entertainment"));
    expect(avg(big, "housing")).toBeLessThan(avg(small, "housing"));
    const inte = data.cities.filter((c) => c.sector === "INT"), tur = data.cities.filter((c) => c.sector === "TUR");
    expect(avg(inte, "mobility")).toBeLessThan(avg(tur, "mobility"));
  });

  it("o alvo acompanha a economia, o emprego e o turismo; a segurança segue o emprego", () => {
    const lowJobs = serviceTarget("safety", 60, { economy: 50, employment: 20, tourism: 50 }, P);
    const highJobs = serviceTarget("safety", 60, { economy: 50, employment: 80, tourism: 50 }, P);
    expect(highJobs).toBeGreaterThan(lowJobs + 5);
  });

  it("um acontecimento mexe no serviço e o resto regride devagar para o alvo", () => {
    const c = data.cities.find((x) => x.sector === "SER") ?? data.cities[0]!;
    const before = initialState(c, data.clubs, new Rng("s", "x"), P);
    const input = { targets: cityTargets(c, data.clubs, P), driftPopulationPct: 0, results: WITHOUT_RESULTS };
    const withHospital = evolveCity(before, { ...input, effects: [P.city.events.types.new_hospital.effects] }, new Rng("s", "y"), P);
    const without = evolveCity(before, { ...input, effects: [] }, new Rng("s", "y"), P);
    expect(withHospital.health - without.health).toBeCloseTo(P.city.events.types.new_hospital.effects.health ?? 0, 5);
    const far = { ...before, safety: 5 };
    const next = evolveCity(far, { ...input, effects: [] }, new Rng("s", "z"), P);
    expect(next.safety).toBeGreaterThan(far.safety);
  });

  it("as setas têm cinco estados", () => {
    const strong = P.city.services.strongTrend, weak = P.city.trendThreshold;
    expect([serviceTrendOf(50, 50 + strong, P), serviceTrendOf(50, 50 + weak, P), serviceTrendOf(50, 51, P), serviceTrendOf(50, 50 - weak, P), serviceTrendOf(50, 50 - strong, P), serviceTrendOf(undefined, 90, P)]).toEqual(["up2", "up1", "stable", "down1", "down2", "stable"]);
  });

  it("efeitos no jogo: saúde recupera mais depressa, vida noturna atrasa quem se cuida pouco, mobilidade/turismo enchem o estádio, cidade cara pede mais ordenado", () => {
    expect(recoveryFactor({ health: 80, entertainment: 50 }, 10, P)).toBeLessThan(1);
    expect(recoveryFactor({ health: 20, entertainment: 50 }, 10, P)).toBeGreaterThan(1);
    expect(recoveryFactor({ health: 50, entertainment: 90 }, 3, P)).toBeGreaterThan(recoveryFactor({ health: 50, entertainment: 90 }, 16, P));
    expect(nightlifeOf(16, 100)).toBe(0);
    expect(nightlifeOf(2, 40)).toBe(0);
    expect(attendanceFactor({ mobility: 90, tourism: 50 }, 3, P)).toBeGreaterThan(1);
    expect(attendanceFactor({ mobility: 50, tourism: 90 }, 7, P)).toBeGreaterThan(attendanceFactor({ mobility: 50, tourism: 90 }, 1, P));
    expect(attendanceFactor(undefined, 7, P)).toBe(1);
    expect(wageFactor({ housing: 20 }, P)).toBeGreaterThan(wageFactor({ housing: 80 }, P));
  });
});
