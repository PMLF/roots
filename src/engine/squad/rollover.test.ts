import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { Rng } from "../random/rng";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { developPlayer, expectedChange } from "./development";
import { createYouth } from "./youth";
import { renewalProbability, retirementProbability, rolloverSquads } from "./rollover";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { foreignClubList } from "./foreign";
import { data, fresh, run, tiers } from "./testWorld.testlib";

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

describe("ciclo anual dos plantéis (2 épocas, rápido)", () => {
  it("mantêm tamanho e contratos vigentes; chegam jovens e há reformas", () => {
    const repo = fresh("squads-fast");
    const summaries = run(repo, 2);
    expect(summaries[0]!.retired).toBeGreaterThan(0);
    for (const c of data.clubs.slice(0, 40)) {
      const squad = repo.clubPlayers(c.id);
      expect(squad.length).toBeGreaterThan(14);
      for (const m of squad) expect(repo.person(m.person)).toBeDefined();
    }
  }, 30000);
});

describe("aposta nos jovens", () => {
  it("quem aposta mais forma jovens com mais qualidade e potencial", () => {
    const club = data.clubs.find((c) => c.tier === "secondLeague")!;
    const sample = (focus: number) => {
      let q = 0, pot = 0;
      for (let i = 0; i < 300; i++) {
        const target = 10 + P.squadCycle.youth.qualityByFocus * (focus - 1);
        const k = createYouth(new Rng("y", `${focus}/${i}`), { id: `x${i}`, club: club as never, tier: "secondLeague", position: "CM", targetQuality: target, focus, wageScale: 1, seasonStart: "2027-07-01", years: 3, cities: data.cities as never, districtCities: [] }, P);
        q += currentQuality(k.player.attributes as Attributes, "CM");
        pot += k.player.potential;
      }
      return { q: q / 300, pot: pot / 300 };
    };
    const low = sample(0.4);
    const high = sample(1.6);
    expect(high.q - low.q).toBeGreaterThan(0.5);
    expect(high.pot - low.pot).toBeGreaterThan(1.5);
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
  }, 30000);
  it("sem mundo gerado não faz nada", () => {
    const repo = new MemoryRepository();
    expect(rolloverSquads(repo, data, P, { season: 1, seasonStart: "2027-07-01", tiers })).toMatchObject({ youth: 0, retired: 0 });
  });
});

describe("ligas estrangeiras", () => {
  it("mantêm o plantel cheio, com idades plausíveis, depois de uma passagem de época", { timeout: 60000 }, () => {
    const repo = fresh("foreign");
    const clubs = foreignClubList(repo);
    expect(clubs.length).toBe(Object.values(P.world.foreignLeagues.clubs).reduce((a, b) => a + b, 0));
    run(repo, 1);
    for (const c of clubs) {
      const squad = repo.clubPlayers(c.id).filter((j) => j.state === "active");
      expect(squad.length).toBe(P.world.foreignLeagues.squad);
      const ages = squad.map((j) => 2027 - Number((repo.person(j.person) as { birth: string }).birth.slice(0, 4)));
      expect(Math.max(...ages)).toBeLessThan(P.squadCycle.retirement.maxAge + 2);
      expect(squad.every((j) => repo.person(j.person)?.nationality === c.country)).toBe(true);
    }
  });
});

