import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

describe("calibração das finanças (RZ-114)", () => {
  it("uma época: resultado líquido por escalão fica perto do equilíbrio e quase ninguém falha", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "finances" } }, s);
    const { repository: repo } = await s.openRepository();
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    let end = false, keeps = 0, summary;
    while (!end && keeps++ < 80) { const r = await handle({ id: 3, type: "advance", input: { mode: "week" } }, s); end = r.seasonEnd; summary = r.seasonSummary; }
    expect(summary).toBeDefined();
    const por = new Map<string, { net: number[]; pct: number[]; neg: number }>();
    for (const c of clubs) {
      const closes = repo.eventsOf({ k: "club", id: c.id }, { type: "FINANCIAL_CLOSE" });
      expect(closes.length).toBeGreaterThanOrEqual(11);
      // as transferências (RZ-205) são capital que muda de mãos, não resultado operacional: ficam de fora da calibração
      const transfers = (e: (typeof closes)[number]) => Number((e.data.month as Record<string, number>).transfers ?? 0);
      const net = closes.reduce((t, e) => t + Number(e.data.revenues) + Number(e.data.expenses) - transfers(e), 0);
      const costs = closes.reduce((t, e) => t - Number(e.data.expenses) + Math.min(0, transfers(e)), 0);
      const tier = c.league.includes("Primeira") ? "PL" : c.league.includes("Segunda") ? "SL" : c.league.includes("Terceira") ? "TL" : c.league.startsWith("CP") ? "CP" : "D";
      const x = por.get(tier) ?? { net: [], pct: [], neg: 0 };
      x.net.push(net); x.pct.push(net / costs);
      if (Number(repo.meta(`balance.${c.id}`)) < 0) x.neg++;
      por.set(tier, x);
    }
    // a ficha do clube: palavra para todos; o clube do gamer vê o saldo exato e o último fecho
    await handle({ id: 4, type: "chooseClub", input: { id: clubs[50]!.id, force: true } }, s);
    const mine = await handle({ id: 5, type: "clubProfile", input: { id: clubs[50]!.id } }, s);
    const other = await handle({ id: 6, type: "clubProfile", input: { id: clubs[51]!.id } }, s);
    expect(mine!.finances.exact).toBe(true);
    expect(mine!.finances.balance).toBe(Number(repo.meta(`balance.${clubs[50]!.id}`)));
    expect(mine!.finances.lastClose).toBeDefined();
    expect(other!.finances.exact).toBe(false);
    expect(other!.finances.balance).toBeUndefined();
    // orçamento do teu clube: por defeito para a nova época; redefinível
    expect(mine!.finances.budget?.wageBillMax).toBeGreaterThan(0);
    const fresh = await handle({ id: 7, type: "setBudget", input: { wageBillMax: 123_000, transfers: 0 } }, s);
    expect(fresh.budget?.wageBillMax).toBe(123_000);
    expect(fresh.budget?.above).toBe(true);
    // calibração: o clube mediano de cada escalão fica perto do equilíbrio e ninguém (ou quase) acaba o ano em negativo
    for (const [e, x] of por) {
      expect(median(x.pct), e).toBeGreaterThan(-0.25); // com um mercado mais vivo (mais ordenados), os escalões baixos ficam um pouco no vermelho
      expect(median(x.pct), e).toBeLessThan(0.35);
      expect(x.neg / x.net.length, e).toBeLessThan(0.05);
    }
  }, 300000);
});
