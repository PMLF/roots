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

const ranks = (xs: number[]) => { const o = xs.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]); const r = new Array<number>(xs.length); o.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
const pearson = (a: number[], b: number[]) => { const n = a.length; const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { s += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; } return s / Math.sqrt(va * vb); };

const csv = read("clubs").replace(/^\uFEFF/, "").split("\n").filter(Boolean).map((l) => l.split(","));
const header = csv[0]!;
const reputationOf = (league: string) => new Map(csv.slice(1).filter((r) => r[header.indexOf("league")] === league).map((r) => [r[0]!, Number(r[header.indexOf("reputation")])] as const));

/** Harness de calibração (RZ-263): quanto a reputação inicial explica a classificação final da liga, e quanto varia de save para save. */
describe("dispersão dos resultados da liga", () => {
  it("a reputação explica a classificação final", async () => {
    const SEEDS = ["a", "b", "c"];
    const LEAGUES = ["Primeira Liga", "Segunda Liga"];
    const result: Record<string, { rho: number[]; topFive: number[]; spread: number[] }> = {};
    for (const seed of SEEDS) {
      const s = servicos();
      await handle({ id: 1, type: "createWorld", input: { seed } }, s);
      const { repository: repo } = await s.openRepository();
      let end = false, k = 0;
      while (!end && k++ < 80) end = (await handle({ id: 3, type: "advance", input: { mode: "week" } }, s)).seasonEnd;
      for (const league of LEAGUES) {
        const table = repo.standings(league, 1);
        const rep = reputationOf(league);
        const clubs = table.map((l) => l.club);
        const pts = table.map((l) => l.points);
        const r = pearson(ranks(clubs.map((c) => rep.get(c) ?? 0)), ranks(pts));
        const byRep = [...clubs].sort((a, b) => (rep.get(b) ?? 0) - (rep.get(a) ?? 0)).slice(0, 5);
        const finalRank = new Map([...table].sort((a, b) => b.points - a.points).map((l, i) => [l.club, i + 1] as const));
        const o = (result[league] ??= { rho: [], topFive: [], spread: [] });
        o.rho.push(r);
        o.topFive.push(byRep.reduce((a, c) => a + (finalRank.get(c) ?? 0), 0) / 5);
        o.spread.push(Math.max(...pts) - Math.min(...pts));
      }
    }
    process.stdout.write("\nDISPERSAO " + JSON.stringify(result, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)) + "\n");
    expect(Object.keys(result)).toHaveLength(LEAGUES.length);
  }, 1_200_000);
});
