import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import type { BaseData } from "../data/types";
import { distributePositions, generateWorld } from "./generateWorld";
import { importCountries, type Country } from "./countries";
import { currentQuality } from "./player";
import { validateWorld } from "./validate";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
if (!d.ok) throw new Error(d.errors.join("\n"));
const data: BaseData = d.data;
const pr = importCountries(read("countries.csv"));
if (!pr.ok) throw new Error(pr.errors.join("\n"));
const countries: Country[] = pr.countries;

const world = (seed: string, p = P) => generateWorld({ seed, data, countries, params: p });

describe("distribuir posições", () => {
  it.each([20, 23, 25, 26, 28])("plantel de %i: soma certa, 2+ GR, todas as posições", (n) => {
    const xs = distributePositions(n, P.world.placesByPosition);
    expect(xs).toHaveLength(n);
    expect(xs.filter((x) => x === "GK").length).toBeGreaterThanOrEqual(2);
    expect(new Set(xs).size).toBe(10);
  });
});

describe("gerarMundo (300 clubes)", () => {
  const t0 = Date.now();
  const batch = world("teste-1");
  const ms = Date.now() - t0;
  const v = validateWorld(batch, data, countries, P);

  it("é válido e tem a escala prevista", () => {
    expect(v.errors).toEqual([]);
    expect(v.summary.people).toBeGreaterThan(12000);
    expect(v.summary.people).toBeLessThan(25000);
    expect(ms).toBeLessThan(15000);
  });
  it("qualidade desce com o escalão e o mix de estrangeiros bate certo", () => {
    const e = v.summary.byTier;
    const q = (k: string) => e[k]!.meanQuality;
    expect(q("firstLeague")).toBeGreaterThan(q("secondLeague"));
    expect(q("secondLeague")).toBeGreaterThan(q("thirdLeague"));
    expect(q("thirdLeague")).toBeGreaterThan(q("cp"));
    expect(q("cp")).toBeGreaterThan(q("district"));
    for (const [tier, target] of Object.entries(P.foreigners)) expect(Math.abs(e[tier]!.foreigners - target)).toBeLessThan(0.06);
    expect(v.warnings).toEqual([]);
  });
  it("a qualidade medida nos atributos-chave segue a qualidade-alvo", () => {
    const js = batch.players.filter((j) => j.club);
    const mean = js.reduce((s, j) => s + currentQuality(j.attributes, j.positions[0]!.pos), 0) / js.length;
    expect(mean).toBeGreaterThan(7);
    expect(mean).toBeLessThan(12);
  });
  it("o potencial nunca fica abaixo da qualidade atual, e os jovens têm margem", () => {
    const fresh = batch.players.filter((j) => j.club).slice(0, 4000);
    let withMargin = 0;
    for (const j of fresh) {
      const q = currentQuality(j.attributes, j.positions[0]!.pos);
      expect(j.potential).toBeGreaterThanOrEqual(Math.round(q * 10) / 10 - 0.05);
      if (j.potential > q + 1) withMargin++;
    }
    expect(withMargin).toBeGreaterThan(100);
  });
  it("os autarcas trazem os traços do CSV (×2)", () => {
    const cd = data.cities[0]!;
    const role = batch.roles.find((c) => c.fn === "mayor" && c.city === cd.id)!;
    const person = batch.people.find((p) => p.id === role.person)!;
    expect(person.personality.ambition).toBe(cd.mayor.traits.ambition);
    expect(person.personality.integrity).toBe(cd.mayor.traits.integrity);
  });
  it("todos os clubes têm presidente e treinador", () => {
    for (const cl of data.clubs.slice(0, 40)) {
      const fs = batch.roles.filter((c) => c.club === cl.id).map((c) => c.fn);
      expect(fs).toContain("president");
      expect(fs).toContain("coach");
    }
  });
  it("jogadores naturais da cidade do clube são mais leais (+3)", () => {
    const naturalDe = new Map(batch.people.map((p) => [p.id, p] as const));
    const cityOf = new Map(data.clubs.map((c) => [c.id, c.city] as const));
    const a: number[] = [];
    const b: number[] = [];
    for (const j of batch.players) {
      if (!j.club) continue;
      const p = naturalDe.get(j.person)!;
      (p.naturalDe === cityOf.get(j.club) ? a : b).push(p.personality.loyalty);
    }
    const m = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(m(a)).toBeGreaterThan(m(b) + 1.5);
  });
});

describe("determinismo e independência", () => {
  it("mesma seed → mesmo mundo; seed diferente → pessoas diferentes", () => {
    const a = world("s1");
    expect(a).toEqual(world("s1"));
    const b = world("s2");
    expect(b.people.map((p) => p.name)).not.toEqual(a.people.map((p) => p.name));
    expect(b.people.length).toBe(a.people.length);
  });
  it("acrescentar um clube não muda os plantéis dos clubes de outros escalões", () => {
    const base = world("s3");
    const withdrawn = data.clubs.find((c) => c.tier === "district")!;
    const less = generateWorld({ seed: "s3", data: { ...data, clubs: data.clubs.filter((c) => c.id !== withdrawn.id) }, countries, params: P });
    const target = data.clubs.find((c) => c.tier === "secondLeague")!.id;
    const names = (l: typeof base) => l.players.filter((j) => j.club === target).map((j) => l.people.find((p) => p.id === j.person)!.name);
    expect(names(less)).toEqual(names(base));
  });

});
