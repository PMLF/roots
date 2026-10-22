import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { annualFixedRevenues } from "../club/finances";
import { monthlySponsorship } from "../club/finances";
import { startCompanies, rolloverCompanies } from "./cycle";
import { sponsorTargets } from "./sponsorship";
import { targetCompanies } from "./generate";
import { COMPANY_SECTORS } from "./sectors";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;
const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));

const fresh = (seed: string) => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", seed);
  repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
  startCompanies(repo, data, P, { seasonStart: "2026-07-01", year: 2026, tiers });
  return repo;
};

const fillByTier = (repo: MemoryRepository, on: string) => {
  const out: Record<string, { got: number; formula: number }> = {};
  for (const c of data.clubs) {
    const o = (out[c.tier] ??= { got: 0, formula: 0 });
    o.got += monthlySponsorship(repo, c, P, on) * 12;
    o.formula += annualFixedRevenues(c, P).sponsorships;
  }
  return Object.fromEntries(Object.entries(out).map(([t, v]) => [t, v.got / v.formula]));
};

describe("empresas no arranque", () => {
  const repo = fresh("empresas");
  it("cada cidade tem as empresas que sustenta, de vários setores e escalas, com dono", () => {
    for (const city of data.cities) expect(repo.companies({ city: city.id }).length).toBeGreaterThanOrEqual(targetCompanies(city, P)); // a maior cidade tem ainda as emissoras nacionais
    const all = repo.companies();
    expect(all.length).toBeGreaterThan(900);
    expect(new Set(all.map((c) => c.sector)).size).toBe(COMPANY_SECTORS.length);
    expect(new Set(all.map((c) => c.scale)).size).toBe(4);
    for (const c of all) {
      expect(c.owner).toBeDefined();
      expect(repo.role(c.owner!)?.fn).toBe("businessperson");
      expect(repo.role(c.owner!)?.city).toBe(c.city);
    }
    expect(new Set(all.map((c) => c.name)).size).toBeGreaterThan(all.length * 0.75);
  });
  it("os donos já existentes no mundo são aproveitados", () => {
    const owners = new Set(repo.companies().map((c) => c.owner));
    const existing = repo.peopleIndex().filter((p) => p.fn === "businessperson" && Number(p.id.slice(1)) <= 60000);
    expect(existing.length).toBeGreaterThan(300);
    expect(existing.filter((p) => owners.has(p.id)).length / existing.length).toBeGreaterThan(0.7);
  });
  it("todos os clubes têm todos os tipos de patrocínio do escalão e recebem perto do valor de referência", () => {
    for (const c of data.clubs) {
      const kinds = repo.clubSponsorships(c.id, "2026-07-01").map((s) => s.kind).filter((k) => k !== "broadcast").sort();
      expect([...new Set(kinds)]).toEqual([...P.companies.sponsorship.slots[c.tier]].sort());
      expect(kinds.length).toBeLessThanOrEqual([...sponsorTargets(c, c.tier, P).values()].reduce((a, b) => a + b, 0));
    }
    for (const [tier, ratio] of Object.entries(fillByTier(repo, "2026-08-01"))) {
      expect(ratio, tier).toBeGreaterThan(0.8);
      expect(ratio, tier).toBeLessThan(1.15);
    }
  });
  it("clubes de escalões altos têm empresas maiores; os distritais, locais", () => {
    const scaleOf = (club: string) => repo.clubSponsorships(club, "2026-07-01").map((s) => repo.company(s.company)!.scale);
    const first = data.clubs.filter((c) => c.tier === "firstLeague").flatMap((c) => scaleOf(c.id));
    const district = data.clubs.filter((c) => c.tier === "district").flatMap((c) => scaleOf(c.id));
    const big = (xs: string[]) => xs.filter((s) => s === "national" || s === "international").length / xs.length;
    expect(big(first)).toBeGreaterThan(0.5);
    expect(big(district)).toBeLessThan(0.1);
  });
  it("determinismo: mesma seed, mesmas empresas e contratos", () => {
    const other = fresh("empresas");
    expect(other.companies()).toEqual(repo.companies());
    expect(other.activeSponsorships("2026-08-01")).toEqual(repo.activeSponsorships("2026-08-01"));
  });
});

describe("ciclo anual das empresas", { timeout: 120000 }, () => {
  const repo = fresh("ciclo");
  const initial = repo.companies().length;
  const summaries: ReturnType<typeof rolloverCompanies>[] = [];
  for (let s = 1; s <= 8; s++) summaries.push(rolloverCompanies(repo, data, P, { season: s, seasonStart: `${2026 + s}-07-01`, year: 2026 + s, tiers, previousTiers: tiers }));
  it("fecham e abrem empresas, os contratos renovam-se e o total de empresas ativas fica estável", () => {
    const sum = (k: keyof (typeof summaries)[number]) => summaries.reduce((a, s) => a + s[k], 0);
    expect(sum("closed")).toBeGreaterThan(40);
    expect(sum("founded")).toBeGreaterThan(40);
    expect(sum("renewed")).toBeGreaterThan(300);
    expect(sum("lapsed")).toBeGreaterThan(100);
    const active = repo.companies({ state: "active" }).length;
    expect(active).toBeGreaterThan(initial * 0.85);
    expect(active).toBeLessThan(initial * 1.15);
    expect(repo.count("COMPANY_CLOSED")).toBe(sum("closed"));
  });
  it("as empresas fechadas não têm patrocínios vigentes e os clubes continuam com todos os tipos", () => {
    for (const c of repo.companies({ state: "closed" })) expect(repo.companySponsorships(c.id)).toEqual([]);
    for (const c of data.clubs) {
      const kinds = repo.clubSponsorships(c.id, "2034-08-01").map((s) => s.kind).filter((k) => k !== "broadcast").sort();
      expect([...new Set(kinds)]).toEqual([...P.companies.sponsorship.slots[c.tier]].sort());
    }
  });
  it("o rendimento dos patrocínios por escalão não derrapa", () => {
    for (const [tier, ratio] of Object.entries(fillByTier(repo, "2034-08-01"))) {
      expect(ratio, tier).toBeGreaterThan(0.75);
      expect(ratio, tier).toBeLessThan(1.2);
    }
  });
  it("sem empresas no mundo (saves de testes) o ciclo não faz nada e o dinheiro vem da fórmula", () => {
    const empty = new MemoryRepository();
    expect(rolloverCompanies(empty, data, P, { season: 1, seasonStart: "2027-07-01", year: 2027, tiers, previousTiers: tiers })).toMatchObject({ founded: 0, signed: 0 });
    const c = data.clubs[0]!;
    expect(monthlySponsorship(empty, c, P, "2026-08-01")).toBeCloseTo(annualFixedRevenues(c, P).sponsorships / 12);
  });
});
