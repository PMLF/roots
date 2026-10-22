import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { BaseCity, BaseClub, BaseData } from "../data/types";
import { initialState, cityTargets } from "../city/state";
import { Rng } from "../random/rng";
import { cityPreHistory, clubPreHistory } from "./preHistory";

const TIERS = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
const club = (over: Partial<BaseClub> & { id: string; tier: BaseClub["tier"]; league: string; reputation: number }): BaseClub => ({ cpSeries: "A", district: "Braga", ...over }) as unknown as BaseClub;
const data = (clubs: BaseClub[]): BaseData => ({ clubs, cities: [], localities: [] }) as unknown as BaseData;
const world = data([
  club({ id: "a", tier: "firstLeague", league: "Primeira Liga", reputation: 8000 }), club({ id: "b", tier: "firstLeague", league: "Primeira Liga", reputation: 1000 }),
  club({ id: "c", tier: "secondLeague", league: "Segunda Liga", reputation: 3000 }), club({ id: "d", tier: "thirdLeague", league: "Terceira Liga", reputation: 2000 }),
  club({ id: "e", tier: "cp", league: "CP Série A", reputation: 1500 }), club({ id: "f", tier: "district", league: "Distrital de Braga", reputation: 500 }),
]);

describe("pré-história dos clubes", () => {
  it("dá o número de épocas pedido, da mais antiga para a mais recente, e termina na época 0", () => {
    const h = clubPreHistory("s", world.clubs[0]!, world, P);
    expect(h).toHaveLength(P.preHistory.seasons);
    expect(h.map((x) => x.season)).toEqual(Array.from({ length: P.preHistory.seasons }, (_, i) => i - (P.preHistory.seasons - 1)));
  });
  it("é sempre igual para a mesma seed e muda com outra", () => {
    const a = clubPreHistory("s", world.clubs[2]!, world, P);
    expect(clubPreHistory("s", world.clubs[2]!, world, P)).toEqual(a);
    const outras = Array.from({ length: 6 }, (_, i) => JSON.stringify(clubPreHistory(`t${i}`, world.clubs[2]!, world, P)));
    expect(new Set([JSON.stringify(a), ...outras]).size).toBeGreaterThan(1);
  });
  it("as posições cabem na liga e as subidas/descidas são coerentes com os escalões", () => {
    for (const c of world.clubs) {
      for (let i = 0; i < 40; i++) {
        const h = clubPreHistory(`seed${i}`, c, world, P);
        h.forEach((x, k) => {
          expect(x.position).toBeGreaterThanOrEqual(1);
          expect(x.position).toBeLessThanOrEqual(x.of);
          const next = k === h.length - 1 ? c.tier : h[k + 1]!.tier;
          const d = TIERS.indexOf(x.tier) - TIERS.indexOf(next);
          expect(Math.abs(d)).toBeLessThanOrEqual(1);
          expect(x.movement).toBe(d > 0 ? "promoted" : d < 0 ? "relegated" : undefined);
          if (x.movement === "promoted") expect(x.position).toBeLessThanOrEqual(Math.max(P.pyramid.secondLeague.rise, P.pyramid.thirdLeague.rise, P.pyramid.cp.risePerSeries, 1));
        });
      }
    }
  });
  it("clubes mais fortes acabam, em média, mais acima na mesma liga", () => {
    let big = 0, small = 0;
    for (let i = 0; i < 100; i++) {
      big += clubPreHistory(`s${i}`, world.clubs[0]!, world, P).filter((x) => x.tier === "firstLeague").reduce((a, x) => a + x.position, 0);
      small += clubPreHistory(`s${i}`, world.clubs[1]!, world, P).filter((x) => x.tier === "firstLeague").reduce((a, x) => a + x.position, 0);
    }
    expect(big).toBeLessThan(small);
  });
});

describe("pré-história das cidades", () => {
  const csv = readFileSync("data/cities.csv", "utf8");
  it("a população recua de forma plausível e tudo fica entre 0 e 100", () => {
    const cities = csv.split("\n").length;
    expect(cities).toBeGreaterThan(10);
    const city = { id: "x", sector: "TUR", tag2: "SER", island: false, population: 100000 } as unknown as BaseCity;
    const initial = { population: 100000, employment: 60, economy: 55, tourism: 70, pride: 50, notoriety: 40, footballCulture: 45, health: 50, education: 50, mobility: 50, housing: 50, safety: 60, entertainment: 45 };
    const targets = { employment: 62, economy: 60, tourism: 70, pride: 50, notoriety: 45, services: { health: 55, education: 55, mobility: 55, housing: 50, safety: 60, entertainment: 50 } };
    const h = cityPreHistory("s", city, initial, targets, P);
    expect(h).toHaveLength(P.preHistory.seasons);
    expect(h[h.length - 1]!.season).toBe(0);
    for (const x of h) {
      expect(x.state.population).toBeGreaterThan(50000);
      expect(x.state.population).toBeLessThan(110000);
      for (const k of ["employment", "economy", "tourism", "pride", "notoriety"] as const) { expect(x.state[k]).toBeGreaterThanOrEqual(0); expect(x.state[k]).toBeLessThanOrEqual(100); }
    }
    expect(cityPreHistory("s", city, initial, targets, P)).toEqual(h);
    void initialState; void cityTargets; void Rng;
  });
});
