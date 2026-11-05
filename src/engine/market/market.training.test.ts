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

describe("compensação de formação (RZ-207)", { timeout: 180000 }, () => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", "formacao");
  repo.saveWorld(generateWorld({ seed: "formacao", data, countries: pr.countries, params: P }));
  ensureBudgets(repo, data, P, 1);
  const top = data.clubs.find((c) => c.tier === "firstLeague")!.id;
  const district = data.clubs.find((c) => c.tier === "district")!.id;
  // liberta 300 jovens de qualidade a meio da tabela para o mercado de livres; metade formou-se num clube da 1.ª Liga, a outra numa distrital
  const ageOf = (id: string) => 2026 - Number(repo.person(id)!.birth.slice(0, 4));
  const young = data.clubs
    .filter((c) => c.tier === "secondLeague" || c.tier === "thirdLeague")
    .flatMap((c) => repo.clubPlayers(c.id).filter((j) => ageOf(j.person) <= P.market.training.ageMax))
    .slice(0, 300);
  young.forEach((j, i) => repo.updatePlayer(j.person, { club: null, state: "free", trainedAt: i % 2 === 0 ? top : district }));
  const before = new Map(data.clubs.map((c) => [c.id, clubBalance(repo, c)] as const));
  let compensation = 0, agentFees = 0;
  for (let day = "2026-07-01"; day <= "2026-09-01"; day = addDays(day, 1)) {
    if (!isMarketDay(day, P)) continue;
    const r = marketRound(repo, data, P, day, 1, {});
    compensation += r.compensation;
    agentFees += r.agentFees;
  }
  const signed = repo.recentEvents({ types: ["PLAYER_SIGNED"], limit: 100000 });

  it("há livres jovens para testar", () => {
    expect(young.length).toBeGreaterThan(10);
  });
  it("quem contrata um livre jovem formado num clube de topo paga-lhe a compensação", () => {
    const withComp = signed.filter((e) => (e.data as { compensation?: number }).compensation);
    expect(compensation).toBeGreaterThan(0);
    expect(withComp.some((e) => e.entities.some((x) => x.roleKind === "trainer" && x.id === top))).toBe(true);
    expect(withComp.length).toBeGreaterThan(0);
    for (const e of withComp) {
      const trainer = e.entities.find((x) => x.roleKind === "trainer")!;
      // paga o clube formador (o de topo do teste ou um dos que formaram jogadores dispensados no mercado), nunca uma distrital
      expect(P.market.training.byTier[data.clubs.find((c) => c.id === trainer.id)!.tier]).toBeGreaterThan(0);
      const buyer = e.entities.find((x) => x.k === "club" && x.roleKind !== "trainer")!;
      expect(buyer.id).not.toBe(trainer.id);
    }
  });
  it("a custo zero quando o clube formador é de uma distrital", () => {
    const fromDistrict = signed.filter((e) => {
      const p = e.entities.find((x) => x.roleKind === "player")!.id;
      return repo.player(p)?.trainedAt === district;
    });
    expect(fromDistrict.length).toBeGreaterThan(0);
    for (const e of fromDistrict) expect((e.data as { compensation?: number }).compensation).toBeUndefined();
  });
  it("o dinheiro conserva-se (menos as comissões dos agentes)", () => {
    const delta = data.clubs.reduce((t, c) => t + clubBalance(repo, c) - (before.get(c.id) as number), 0);
    expect(Math.abs(delta + agentFees)).toBeLessThan(1);
  });
});
