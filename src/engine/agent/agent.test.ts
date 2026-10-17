import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { Rng } from "../random/rng";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { agentTraits, assignAgents } from "./assign";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;
const tierOf = (club: string) => data.clubs.find((c) => c.id === club)?.tier;

const fresh = (seed: string) => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", seed);
  repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
  return repo;
};

describe("agentes (RZ-206)", () => {
  const repo = fresh("agentes");
  const n = assignAgents(repo, new Rng("agentes", "a"), P, tierOf);
  const players = repo.playersByState("active");

  it("há agentes no mundo e a quota cai com o escalão", () => {
    expect(repo.roleHolders("agent").length).toBeGreaterThan(50);
    expect(n).toBeGreaterThan(500);
    const share = (tier: string) => {
      const ps = players.filter((j) => j.club && tierOf(j.club) === tier);
      return ps.filter((j) => j.agent).length / ps.length;
    };
    expect(share("firstLeague")).toBeGreaterThan(0.7);
    expect(share("firstLeague")).toBeGreaterThan(share("thirdLeague"));
    expect(share("thirdLeague")).toBeGreaterThan(share("district"));
    expect(share("district")).toBeLessThan(0.12);
  });
  it("os agentes existem, têm personalidade, e uns têm muito mais clientes do que outros", () => {
    const counts = new Map<string, number>();
    for (const j of repo.playersByState("active")) if (j.agent) counts.set(j.agent, (counts.get(j.agent) ?? 0) + 1);
    for (const a of counts.keys()) {
      expect(repo.role(a)?.fn).toBe("agent");
      expect(agentTraits(repo, a)!.greed).toBeGreaterThanOrEqual(1);
    }
    const values = [...counts.values()].sort((a, b) => b - a);
    expect(values[0]!).toBeGreaterThan((values.reduce((a, b) => a + b, 0) / values.length) * 2);
  });
  it("é determinístico e não reatribui quem já tem agente", () => {
    const a = fresh("agentes");
    const b = fresh("agentes");
    assignAgents(a, new Rng("agentes", "a"), P, tierOf);
    assignAgents(b, new Rng("agentes", "a"), P, tierOf);
    expect(a.playersByState("active").map((j) => j.agent)).toEqual(b.playersByState("active").map((j) => j.agent));
    const before = new Map(repo.playersByState("active").filter((j) => j.agent).map((j) => [j.person, j.agent] as const));
    assignAgents(repo, new Rng("agentes", "b"), P, tierOf);
    for (const [person, agent] of before) expect(repo.player(person)?.agent).toBe(agent);
  });
});
