import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../random/rng";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { developPlayer, expectedChange } from "./development";
import { youthFocus } from "./youthFocus";
import { renewalProbability, retirementProbability, rolloverSquads } from "./rollover";

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
  return repo;
};
const run = (repo: MemoryRepository, seasons: number, gamerClub?: string) => {
  const out = [];
  for (let s = 1; s <= seasons; s++) out.push(rolloverSquads(repo, data, P, { season: s, seasonStart: `${2026 + s}-07-01`, tiers, ...(gamerClub ? { gamerClub } : {}) }));
  return out;
};
const meanQuality = (repo: MemoryRepository, tier: string) => {
  let sum = 0, n = 0;
  for (const c of data.clubs.filter((x) => x.tier === tier)) for (const j of repo.clubPlayers(c.id)) { sum += currentQuality(j.attributes as Attributes, j.positions[0]!.pos as Position); n++; }
  return sum / n;
};

describe("desenvolvimento", () => {
  it("jovens crescem em direção ao potencial, veteranos descem", () => {
    expect(expectedChange(8, 14, 19, P)).toBeGreaterThan(1);
    expect(expectedChange(14, 14, 28, P)).toBe(0);
    expect(expectedChange(14, 14, 34, P)).toBeLessThan(-0.4);
    expect(expectedChange(14, 14, 36, P)).toBeLessThan(expectedChange(14, 14, 32, P));
  });
  it("em média o jovem sobe e o veterano desce; sempre entre 1 e 20", () => {
    const repo = fresh("dev");
    const squad = data.clubs.filter((c) => c.tier === "secondLeague").flatMap((c) => repo.clubPlayers(c.id));
    const gap = (age: number) => {
      let total = 0;
      squad.forEach((j, i) => {
        const pos = j.positions[0]!.pos as Position;
        const r = developPlayer(new Rng("t", String(i)), { attributes: j.attributes, potential: Math.max(j.potential, currentQuality(j.attributes as Attributes, pos) + 3), position: pos, age }, P);
        for (const v of Object.values(r.attributes)) expect(v >= 1 && v <= 20).toBe(true);
        total += r.quality - currentQuality(j.attributes as Attributes, pos);
      });
      return total / squad.length;
    };
    expect(gap(19)).toBeGreaterThan(0.3);
    expect(gap(35)).toBeLessThan(-0.3);
  });
  it("probabilidades de reforma e renovação", () => {
    expect(retirementProbability(30, "CM", false, P)).toBe(0);
    expect(retirementProbability(36, "CM", false, P)).toBeGreaterThan(retirementProbability(34, "CM", false, P));
    expect(retirementProbability(36, "GK", false, P)).toBeLessThan(retirementProbability(36, "CM", false, P));
    expect(retirementProbability(35, "CM", true, P)).toBeGreaterThan(retirementProbability(35, "CM", false, P));
    expect(retirementProbability(P.squadCycle.retirement.maxAge, "GK", false, P)).toBe(1);
    expect(renewalProbability(14, 10, 25, P)).toBeGreaterThan(renewalProbability(8, 10, 25, P));
    expect(renewalProbability(10, 10, 35, P)).toBeLessThan(renewalProbability(10, 10, 28, P));
  });
});

describe("ciclo anual dos plantéis (várias épocas)", () => {
  const repo = fresh("squads");
  const free0 = repo.playersByState("free").length;
  const total0 = repo.peopleTotal();
  const q0 = Object.fromEntries(["firstLeague", "secondLeague", "thirdLeague", "cp", "district"].map((t) => [t, meanQuality(repo, t)]));
  const summaries = run(repo, 10);

  it("os plantéis mantêm o tamanho: entre o alvo e o alvo + folga", () => {
    for (const c of data.clubs) {
      const n = repo.clubPlayers(c.id).length;
      const target = P.world.squad[c.tier];
      expect(n).toBeGreaterThanOrEqual(target);
      expect(n).toBeLessThanOrEqual(target + P.squadCycle.squad.slack + P.squadCycle.youth.perClub[c.tier]);
    }
  });
  it("todos os jogadores de um clube têm contrato vigente no clube", () => {
    for (const c of data.clubs) for (const j of repo.clubPlayers(c.id)) {
      const ct = repo.contract(j.person)!;
      expect(ct.club).toBe(c.id);
      expect(ct.end >= "2036-07-01").toBe(true);
      expect(j.state).toBe("active");
    }
  });
  it("reformam-se, renovam, contratam livres e a formação traz gente nova", () => {
    const sum = (k: keyof (typeof summaries)[number]) => summaries.reduce((a, s) => a + s[k], 0);
    expect(sum("retired")).toBeGreaterThan(300);
    expect(sum("renewed")).toBeGreaterThan(1000);
    expect(sum("released")).toBeGreaterThan(300);
    expect(sum("signedFree")).toBeGreaterThan(300);
    expect(sum("youth")).toBeGreaterThan(1500);
    expect(repo.peopleTotal()).toBeGreaterThan(total0);
    expect(repo.count("PLAYER_RETIRED")).toBe(sum("retired"));
    expect(repo.count("CONTRACT_RENEWED")).toBe(sum("renewed"));
  });
  it("a idade média dos plantéis e a bolsa de livres ficam estáveis", () => {
    const born = (id: string) => repo.person(id)!.birth;
    const ages = data.clubs.flatMap((c) => repo.clubPlayers(c.id).map((j) => 2036.5 - Number(born(j.person).slice(0, 4))));
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    expect(mean).toBeGreaterThan(P.world.age.mean - 3);
    expect(mean).toBeLessThan(P.world.age.mean + 2);
    expect(Math.max(...ages)).toBeLessThanOrEqual(P.squadCycle.retirement.maxAge + 1); // idade aproximada pelo ano de nascimento
    const free = repo.playersByState("free").length;
    expect(free).toBeGreaterThan(free0 * 0.3);
    expect(free).toBeLessThan(free0 * 3);
  });
  it("a qualidade média por escalão não deriva mais de 1 ponto", () => {
    for (const [tier, q] of Object.entries(q0)) expect(Math.abs(meanQuality(repo, tier) - q), tier).toBeLessThan(1);
  });
});

describe("aposta nos jovens", () => {
  it("os clubes diferem na aposta e quem aposta mais tem plantéis mais jovens", { timeout: 120000 }, () => {
    const repo = fresh("focus");
    run(repo, 8);
    const focus = new Map(data.clubs.map((c) => [c.id, youthFocus(repo, c, c.tier, P)] as const));
    const values = [...focus.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(P.squadCycle.youth.focus.min);
    expect(Math.max(...values)).toBeLessThanOrEqual(P.squadCycle.youth.focus.max);
    expect(youthFocus(repo, data.clubs[0]!, data.clubs[0]!.tier, P)).toBe(focus.get(data.clubs[0]!.id));
    const meanAge = (clubs: string[]) => {
      const ages = clubs.flatMap((c) => repo.clubPlayers(c).map((j) => 2034 - Number(repo.person(j.person)!.birth.slice(0, 4))));
      return ages.reduce((a, b) => a + b, 0) / ages.length;
    };
    let diff = 0;
    for (const tier of ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"]) {
      const sorted = data.clubs.filter((c) => c.tier === tier).map((c) => c.id).sort((a, b) => (focus.get(a) as number) - (focus.get(b) as number));
      const third = Math.floor(sorted.length / 3);
      diff += meanAge(sorted.slice(0, third)) - meanAge(sorted.slice(-third));
    }
    expect(diff / 5).toBeGreaterThan(0.4);
  });
});

describe("determinismo e clube do gamer", () => {
  it("mesma seed, mesmo resultado", { timeout: 60000 }, () => {
    const a = fresh("det");
    const b = fresh("det");
    run(a, 2);
    run(b, 2);
    expect(a.peopleTotal()).toBe(b.peopleTotal());
    const c = data.clubs[10]!.id;
    expect(a.clubPlayers(c)).toEqual(b.clubPlayers(c));
  });
  it("o clube do gamer renova sempre quem acaba contrato (até haver ecrã de renovações)", () => {
    const repo = fresh("gamer");
    const club = data.clubs.find((c) => c.tier === "district")!.id;
    const before = repo.clubPlayers(club).filter((j) => (repo.contract(j.person)?.end ?? "") < "2027-07-01").map((j) => j.person);
    const s = rolloverSquads(repo, data, P, { season: 1, seasonStart: "2027-07-01", tiers, gamerClub: club });
    expect(s.signedFree + s.youth).toBeGreaterThanOrEqual(0);
    for (const person of before) {
      const j = repo.player(person)!;
      if (j.state !== "retired") expect(j.club).toBe(club);
    }
  });
  it("sem mundo gerado não faz nada", () => {
    const repo = new MemoryRepository();
    expect(rolloverSquads(repo, data, P, { season: 1, seasonStart: "2027-07-01", tiers })).toMatchObject({ youth: 0, retired: 0 });
  });
});
