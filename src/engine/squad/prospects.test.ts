import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { Rng } from "../random/rng";
import { cityCeiling, newProspects, prospectCount } from "./prospects";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const imported = importData({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts") });
if (!imported.ok) throw new Error("dados inválidos");
const data = imported.data;
const ids = () => { let n = 0; return () => `p${String(++n).padStart(6, "0")}`; };
const opts = (seed: string) => ({ season: 1, seasonStart: "2026-07-01", seed, nextId: ids() });

describe("talento local (RZ-234)", () => {
  it("o teto cresce com a população e a cultura de futebol", () => {
    const small = cityCeiling({ population: 5_000, footballCulture: 30 }, P);
    expect(cityCeiling({ population: 50_000, footballCulture: 30 }, P)).toBeGreaterThan(small);
    expect(cityCeiling({ population: 5_000, footballCulture: 60 }, P)).toBeCloseTo(small * 2, 6);
  });

  it("o número de jovens por concelho tem a média parametrizada e é determinístico", () => {
    const ceilings = data.cities.map((c) => cityCeiling(c, P));
    const mean = ceilings.reduce((a, b) => a + b, 0) / ceilings.length;
    let total = 0;
    ceilings.forEach((c, i) => { total += prospectCount(c, mean, P, new Rng("t", `n/${i}`)); });
    expect(total / ceilings.length).toBeGreaterThan(P.squadCycle.youth.prospects.perCityMean * 0.85);
    expect(total / ceilings.length).toBeLessThan(P.squadCycle.youth.prospects.perCityMean * 1.15);
    const a = newProspects(data, P, opts("seed-a"));
    const b = newProspects(data, P, opts("seed-a"));
    expect(a.people.map((x) => x.id + x.name)).toEqual(b.people.map((x) => x.id + x.name));
  });

  it("gera jovens sem clube nem contrato, da terra, com a idade parametrizada", () => {
    const batch = newProspects(data, P, opts("seed-b"));
    const cityIds = new Set(data.cities.map((c) => c.id));
    const pr = P.squadCycle.youth.prospects;
    expect(batch.players.length).toBe(batch.people.length);
    expect(batch.contracts).toHaveLength(0);
    for (const j of batch.players) {
      expect(j.state).toBe("prospect");
      expect(j.club).toBeUndefined();
    }
    for (const p of batch.people) {
      expect(cityIds.has(p.birthCity ?? "")).toBe(true);
      const age = (Date.parse("2026-07-01") - Date.parse(p.birth)) / (365.25 * 86_400_000);
      expect(age).toBeGreaterThanOrEqual(pr.ageMin);
      expect(age).toBeLessThan(pr.ageMax + 1);
    }
    // concelhos maiores dão mais jovens que os pequenos
    const byCity = new Map<string, number>();
    for (const p of batch.people) byCity.set(p.birthCity!, (byCity.get(p.birthCity!) ?? 0) + 1);
    const biggest = [...data.cities].sort((a, b) => cityCeiling(b, P) - cityCeiling(a, P))[0]!;
    const smallest = [...data.cities].sort((a, b) => cityCeiling(a, P) - cityCeiling(b, P))[0]!;
    expect(byCity.get(biggest.id) ?? 0).toBeGreaterThan(byCity.get(smallest.id) ?? 0);
  });
});
