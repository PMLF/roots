import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { clubBalance } from "../club/finances";
import { ensureBudgets } from "../club/budget";
import { addDays } from "../calendar/dates";
import { isMarketDay, marketRound } from "./market";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;

describe("cláusula de revenda (RZ-207)", { timeout: 180000 }, () => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", "revenda");
  repo.saveWorld(generateWorld({ seed: "revenda", data, countries: pr.countries, params: P }));
  ensureBudgets(repo, data, P, 1);
  const origin = data.clubs.find((c) => c.tier === "thirdLeague")!.id;
  // todos os jogadores com contrato têm uma cláusula de 15 % a favor de um clube de origem
  for (const j of repo.playersByState("active")) {
    const ct = repo.contract(j.person);
    if (ct && j.club !== origin) repo.saveContract({ ...ct, clauses: { resale: { club: origin, pct: 0.15 } } });
  }
  const before = new Map(data.clubs.map((c) => [c.id, clubBalance(repo, c)] as const));
  let resale = 0, agentFees = 0;
  for (let day = "2026-07-01"; day <= "2026-09-01"; day = addDays(day, 1)) {
    if (!isMarketDay(day, P)) continue;
    const r = marketRound(repo, data, P, day, 1, {});
    resale += r.resale;
    agentFees += r.agentFees;
  }
  const transfers = repo.recentEvents({ types: ["TRANSFER"], limit: 100000 });

  it("o clube de origem recebe a sua parte, que sai do vendedor", () => {
    expect(transfers.some((e) => e.entities.some((x) => x.roleKind === "resale" && x.id === origin))).toBe(true);
    expect(resale).toBeGreaterThan(0);
    const withCut = transfers.filter((e) => (e.data as { resaleCut?: number }).resaleCut);
    expect(withCut.length).toBeGreaterThan(10);
    for (const e of withCut) {
      const { fee, resaleCut } = e.data as { fee: number; resaleCut: number };
      expect(resaleCut / fee).toBeGreaterThanOrEqual(0.07);
      expect(resaleCut / fee).toBeLessThanOrEqual(0.21);
      expect(e.entities.some((x) => x.roleKind === "resale")).toBe(true);
    }
  });
  it("o dinheiro continua a conservar-se (menos as comissões dos agentes)", () => {
    const delta = data.clubs.reduce((t, c) => t + clubBalance(repo, c) - (before.get(c.id) as number), 0);
    expect(Math.abs(delta + agentFees)).toBeLessThan(1);
  });
  it("quem foi vendido passa a ter uma cláusula a favor de quem o vendeu, ou nenhuma", () => {
    let withClause = 0, without = 0;
    const last = new Map<string, (typeof transfers)[number]>();
    for (const e of transfers) {
      const id = e.entities.find((x) => x.roleKind === "player")!.id;
      if (!last.has(id) || last.get(id)!.id < e.id) last.set(id, e);
    }
    for (const e of last.values()) {
      const person = e.entities.find((x) => x.roleKind === "player")!.id;
      const seller = e.entities.find((x) => x.roleKind === "seller")!.id;
      const cl = repo.contract(person)?.clauses?.resale;
      if (cl) { withClause++; expect(cl.club).toBe(seller); expect(cl.pct).toBeGreaterThanOrEqual(0.08); expect(cl.pct).toBeLessThanOrEqual(0.2); }
      else without++;
    }
    expect(withClause).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
  });
});
