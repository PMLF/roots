import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { ensureBudgets } from "../club/budget";
import { addDays } from "../calendar/dates";
import { assignAgents } from "../agent/assign";
import { Rng } from "../random/rng";
import { isMarketDay, marketRound } from "./market";
import { releaseClause } from "./clauses";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;

describe("cláusula de rescisão (RZ-207)", () => {
  it("a probabilidade e o valor seguem os parâmetros e o agente ganancioso põe mais cláusulas", () => {
    let low = 0, high = 0;
    const n = 2000;
    const factors: number[] = [];
    for (let i = 0; i < n; i++) {
      if (releaseClause(new Rng("r", `l${i}`), 100_000, 10, P) !== undefined) low++;
      const v = releaseClause(new Rng("r", `h${i}`), 100_000, 19, P);
      if (v !== undefined) { high++; factors.push(v / 100_000); }
    }
    expect(high).toBeGreaterThan(low);
    expect(low / n).toBeGreaterThan(0);
    expect(Math.min(...factors)).toBeGreaterThanOrEqual(P.market.clauses.releaseFactor[0] - 0.001);
    expect(Math.max(...factors)).toBeLessThanOrEqual(P.market.clauses.releaseFactor[1] + 0.001);
    expect(releaseClause(new Rng("r", "z"), 0, 10, P)).toBeUndefined();
  });

  describe("no mercado", { timeout: 180000 }, () => {
    const repo = new MemoryRepository();
    repo.setMeta("seed", "rescisao");
    repo.saveWorld(generateWorld({ seed: "rescisao", data, countries: pr.countries, params: P }));
    assignAgents(repo, new Rng("rescisao", "a"), P, (c) => data.clubs.find((x) => x.id === c)?.tier);
    ensureBudgets(repo, data, P, 1);
    // todos os jogadores já têm uma cláusula barata: quem recusa vender é contornado pelo comprador
    for (const j of repo.playersByState("active")) {
      const ct = repo.contract(j.person);
      if (ct) repo.saveContract({ ...ct, clauses: { release: Math.round(ct.monthlyWage * 12 * 1.2) } });
    }
    let releases = 0, transfers = 0;
    for (let day = "2026-07-01"; day <= "2026-09-01"; day = addDays(day, 1)) {
      if (!isMarketDay(day, P)) continue;
      const r = marketRound(repo, data, P, day, 1, {});
      releases += r.releases;
      transfers += r.transfers;
    }
    const events = repo.recentEvents({ types: ["TRANSFER"], limit: 100000 });

    it("há transferências por cláusula, pagas pelo valor da cláusula", () => {
      expect(transfers).toBeGreaterThan(30);
      expect(releases).toBeGreaterThan(0);
      expect(events.filter((e) => (e.data as { release?: boolean }).release).length).toBe(releases);
    });
    it("os contratos novos trazem por vezes uma cláusula de rescisão", () => {
      const moved = events.map((e) => e.entities.find((x) => x.roleKind === "player")!.id);
      const withRelease = moved.filter((id) => repo.contract(id)?.clauses?.release !== undefined).length;
      expect(withRelease).toBeGreaterThan(0);
      expect(withRelease).toBeLessThan(moved.length);
    });
  });
});
