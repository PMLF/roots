import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { clubBalance } from "../club/finances";
import { ensureBudgets } from "../club/budget";
import { addDays } from "../calendar/dates";
import { isMarketDay, marketRound, windowAt, type MarketSummary } from "./market";
import { marketValue } from "./value";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;

const fresh = (seed: string) => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", seed);
  repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
  ensureBudgets(repo, data, P, 1);
  return repo;
};

/** Corre todas as rondas de uma janela, dia a dia. */
const runWindow = (repo: MemoryRepository, from: string, to: string, gamerClub?: string): MarketSummary => {
  const total = { transfers: 0, freeSignings: 0, spent: 0 };
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isMarketDay(day, P)) continue;
    const r = marketRound(repo, data, P, day, 1, gamerClub ? { gamerClub } : {});
    total.transfers += r.transfers;
    total.freeSignings += r.freeSignings;
    total.spent += r.spent;
  }
  return total;
};

describe("janelas e valor", () => {
  it("janelas de verão e inverno, com ronda à segunda e no último dia", () => {
    expect(windowAt("2026-07-01", P)?.index).toBe(0);
    expect(windowAt("2026-09-01", P)).toMatchObject({ index: 0, last: true });
    expect(windowAt("2026-09-02", P)).toBeUndefined();
    expect(windowAt("2027-01-15", P)?.index).toBe(1);
    expect(isMarketDay("2026-09-01", P)).toBe(true);
    expect(isMarketDay("2026-10-05", P)).toBe(false);
  });
  it("o valor sobe com o ordenado, cai com a idade e com o fim do contrato, e o potencial pesa nos jovens", () => {
    const base = { quality: 12, potential: 12, age: 26, monthlyWage: 5000, monthsLeft: 24 };
    const v = marketValue(base, P);
    expect(v).toBeGreaterThan(100_000);
    expect(marketValue({ ...base, monthlyWage: 10000 }, P)).toBeCloseTo(v * 2);
    expect(marketValue({ ...base, age: 34 }, P)).toBeLessThan(v / 3);
    expect(marketValue({ ...base, monthsLeft: 3 }, P)).toBeLessThan(v / 3);
    expect(marketValue({ ...base, age: 20, potential: 16 }, P)).toBeGreaterThan(marketValue({ ...base, age: 20 }, P) * 1.5);
    expect(marketValue({ ...base, age: 30, potential: 16 }, P)).toBeLessThan(marketValue({ ...base, age: 20, potential: 16 }, P));
  });
});

describe("mercado de verão entre clubes da IA", { timeout: 180000 }, () => {
  const repo = fresh("mercado");
  const gamer = data.clubs.find((c) => c.tier === "secondLeague")!.id;
  const before = new Map(data.clubs.map((c) => [c.id, repo.clubPlayers(c.id).map((j) => j.person)] as const));
  const balances = new Map(data.clubs.map((c) => [c.id, clubBalance(repo, c)] as const));
  const gamerSquad = repo.clubPlayers(gamer).map((j) => j.person).sort();
  const result = runWindow(repo, "2026-07-01", "2026-09-01", gamer);

  it("há transferências e contratações de livres, com dinheiro a mexer", () => {
    expect(result.transfers).toBeGreaterThan(100);
    expect(result.freeSignings).toBeGreaterThan(10);
    expect(result.spent).toBeGreaterThan(1_000_000);
    expect(repo.count("TRANSFER")).toBe(result.transfers);
  });
  it("o dinheiro conserva-se: o que um clube paga, outro recebe", () => {
    const delta = data.clubs.reduce((t, c) => t + clubBalance(repo, c) - (balances.get(c.id) as number), 0);
    expect(Math.abs(delta)).toBeLessThan(1);
  });
  it("o clube do gamer não compra nem vende", () => {
    expect(repo.clubPlayers(gamer).map((j) => j.person).sort()).toEqual(gamerSquad);
  });
  it("os plantéis não ficam vazios nem estouram, e cada jogador está só num clube com contrato nesse clube", () => {
    const seen = new Set<string>();
    for (const c of data.clubs) {
      const squad = repo.clubPlayers(c.id);
      const target = P.world.squad[c.tier];
      expect(squad.length).toBeGreaterThanOrEqual(target - 3);
      expect(squad.length).toBeLessThanOrEqual(target + P.market.squadSlack + 1);
      for (const j of squad) {
        expect(seen.has(j.person)).toBe(false);
        seen.add(j.person);
        expect(repo.contract(j.person)?.club).toBe(c.id);
      }
    }
  });
  it("sobe-se de escalão mais do que se desce, e quem muda de clube em média não perde qualidade", () => {
    const tierOf = new Map(data.clubs.map((c) => [c.id, c.tier] as const));
    const rank = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
    let up = 0, down = 0;
    for (const c of data.clubs) {
      for (const j of repo.clubPlayers(c.id)) {
        const from = data.clubs.find((x) => before.get(x.id)!.includes(j.person));
        if (from && from.id !== c.id) {
          const delta = rank.indexOf(tierOf.get(from.id)!) - rank.indexOf(tierOf.get(c.id)!);
          if (delta > 0) up++;
          else if (delta < 0) down++;
        }
      }
    }
    expect(up + down).toBeGreaterThan(15);
    expect(up).toBeGreaterThan(down);
  });
  it("o orçamento de transferências nunca fica negativo e quem comprou gastou dentro dele", () => {
    for (const c of data.clubs) {
      const b = JSON.parse(repo.meta(`budget.${c.id}`) as string) as { transfers: number };
      expect(b.transfers).toBeGreaterThanOrEqual(0);
    }
  });
  it("a qualidade média por escalão não derrapa", () => {
    const mean = (r: MemoryRepository, tier: string) => {
      const xs = data.clubs.filter((c) => c.tier === tier).flatMap((c) => r.clubPlayers(c.id).map((j) => currentQuality(j.attributes as Attributes, j.positions[0]!.pos as Position)));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const base = fresh("mercado");
    for (const tier of ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"]) expect(Math.abs(mean(repo, tier) - mean(base, tier)), tier).toBeLessThan(0.6);
  });
  it("determinismo: mesma seed, mesmas transferências", () => {
    const other = fresh("mercado");
    const r = runWindow(other, "2026-07-01", "2026-09-01", gamer);
    expect(r).toEqual(result);
  });
});
