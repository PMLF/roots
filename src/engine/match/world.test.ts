import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { teamOf, teamStrength, type LineupCandidate } from "./team";
import { simulateMatch } from "./simulator";
import type { MatchTeam } from "./types";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("dados inválidos");
const batch = generateWorld({ seed: "jogo-mundo", data: d.data, countries: pr.countries, params: P });

function clubTeam(club: string): MatchTeam {
  const cs: LineupCandidate[] = batch.players
    .filter((j) => j.club === club && j.state === "active")
    .map((j) => ({ person: j.person, positions: j.positions, attributes: j.attributes, heightCm: j.heightCm }));
  return teamOf(club, cs);
}
const first = (tier: string, n = 1) => d.data.clubs.filter((c) => c.tier === tier).slice(0, n).map((c) => c.id);

describe("motor de jogo com o mundo gerado", () => {
  it("todos os clubes montam onze com 1 guarda-redes e a força cresce com o escalão", () => {
    const mean: Record<string, number[]> = {};
    for (const c of d.data.clubs) {
      const eq = clubTeam(c.id);
      expect(eq.lineup).toHaveLength(11);
      expect(eq.lineup.filter((j) => j.position === "GK")).toHaveLength(1);
      const f = teamStrength(eq.lineup);
      (mean[c.tier] ??= []).push((f.attack + f.control + f.defence) / 3);
    }
    const m = (e: string) => (mean[e] as number[]).reduce((a, b) => a + b, 0) / (mean[e] as number[]).length;
    expect(m("firstLeague")).toBeGreaterThan(m("secondLeague"));
    expect(m("secondLeague")).toBeGreaterThan(m("thirdLeague"));
    expect(m("thirdLeague")).toBeGreaterThan(m("cp"));
    expect(m("cp")).toBeGreaterThan(m("district"));
  });

  it("um clube da Primeira Liga ganha quase sempre a um distrital; e entre pares há equilíbrio", () => {
    const [pl1, pl2] = first("firstLeague", 2) as [string, string];
    const [di] = first("district") as [string];
    const a = clubTeam(pl1);
    const b = clubTeam(pl2);
    const z = clubTeam(di);
    let wins = 0;
    let pairsGoals = 0;
    let aWins = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r1 = simulateMatch({ seed: "w", id: `x${i}`, home: a, away: z }, P).summary;
      if (r1.home.goals > r1.away.goals) wins++;
      const r2 = simulateMatch({ seed: "w", id: `y${i}`, home: a, away: b }, P).summary;
      pairsGoals += r2.home.goals + r2.away.goals;
      if (r2.home.goals > r2.away.goals) aWins++;
    }
    expect(wins / N).toBeGreaterThan(0.75);
    expect(pairsGoals / N).toBeGreaterThan(1.8);
    expect(pairsGoals / N).toBeLessThan(3.6);
    expect(aWins / N).toBeGreaterThan(0.2);
    expect(aWins / N).toBeLessThan(0.8);
  });
});
