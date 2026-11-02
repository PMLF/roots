import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { cityHistoryWithPast } from "../city/cities";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { currentQuality } from "../world/player";
import { importData } from "../data/importData";
import { openSqliteBetter } from "../../node/driverBetterSqlite";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { SqliteRepository } from "../persistence/repositorySqlite";

/**
 * Calibração de várias épocas (RZ-237, docs/CITY.md §12.7): corre `CALIB_SEASONS` épocas (por defeito 3) sem gamer a mexer e mede se os
 * custos do sucesso seguram a bola de neve: caixa por escalão, mobilidade de escalão, população das cidades e empresas.
 * `CALIB_OUT=/caminho.json` grava o relatório época a época. `CALIB_DB=/caminho.sqlite` guarda o mundo no disco no fim de cada época e,
 * se o ficheiro já existir, retoma a partir da última época feita (sobrevive a reinícios do ambiente).
 */
const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const raw = { clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") };
const imported = importData({ clubs: raw.clubs, cities: raw.cities, localities: raw.localities, rivalries: raw.rivalries, districts: raw.districts });
if (!imported.ok) throw new Error(imported.errors.slice(0, 3).join("\n"));
const data = imported.data;

const quantile = (v: number[], q: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * q))] ?? 0;
const tierOf = (league: string) => (league.includes("Primeira") ? "PL" : league.includes("Segunda") ? "SL" : league.includes("Terceira") ? "TL" : league.startsWith("CP") ? "CP" : "D");
const SEASONS = Number(process.env.CALIB_SEASONS ?? 3);

describe("calibração de várias épocas (RZ-237)", () => {
  it(`${SEASONS} épocas: caixa, mobilidade, população e empresas não divergem`, async () => {
    const dbPath = process.env.CALIB_DB;
    const resumed = !!dbPath && existsSync(dbPath);
    const repository = dbPath ? new SqliteRepository(openSqliteBetter(dbPath)) : new MemoryRepository();
    const s: Servicos = { now: () => new Date(2026, 9, 15), openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }), loadData: async () => raw };
    if (!resumed) await handle({ id: 1, type: "createWorld", input: { seed: "success" } }, s);
    const start = new Map<string, number>(resumed ? (JSON.parse(repository.meta("calib.start") ?? "[]") as [string, number][]) : data.cities.map((c) => [c.id, cityHistoryWithPast(repository, data, P, c.id).at(-1)?.state.population ?? c.population] as const));
    if (!resumed) repository.setMeta("calib.start", JSON.stringify([...start]));
    let before = new Map((await handle({ id: 2, type: "clubs", input: null }, s)).map((c) => [c.id, tierOf(c.league)] as const));
    const report: unknown[] = resumed ? (JSON.parse(repository.meta("calib.report") ?? "[]") as unknown[]) : [];
    let id = 10;
    for (let season = report.length + 1; season <= SEASONS; season++) {
      let end = false, guard = 0;
      while (!end && guard++ < 90) end = (await handle({ id: id++, type: "advance", input: { mode: "week" } }, s)).seasonEnd;
      const clubs = await handle({ id: id++, type: "clubs", input: null }, s);
      const after = new Map(clubs.map((c) => [c.id, tierOf(c.league)] as const));
      const byTier = new Map<string, number[]>();
      for (const c of clubs) { const t = tierOf(c.league); byTier.set(t, [...(byTier.get(t) ?? []), Number(repository.meta(`balance.${c.id}`) ?? 0)]); }
      const moved = [...after].filter(([c, t]) => before.get(c) !== t).length;
      const ratios = data.cities.map((c) => (cityHistoryWithPast(repository, data, P, c.id).at(-1)?.state.population ?? 0) / (start.get(c.id) ?? 1));
      // Qualidade dos plantéis por escalão: média dos 16 melhores de cada clube (currentQuality); e jogadores livres.
      const strength = new Map<string, number[]>();
      for (const c of clubs) {
        const q = repository.clubPlayers(c.id).filter((j) => j.state === "active").map((j) => currentQuality(j.attributes as Parameters<typeof currentQuality>[0], (j.positions[0]?.pos ?? "CM") as Parameters<typeof currentQuality>[1])).sort((a, b) => b - a).slice(0, 16);
        const t = tierOf(c.league);
        strength.set(t, [...(strength.get(t) ?? []), q.reduce((a, b) => a + b, 0) / Math.max(1, q.length)]);
      }
      const free = repository.playersByState("free");
      const freeQ = free.map((j) => currentQuality(j.attributes as Parameters<typeof currentQuality>[0], (j.positions[0]?.pos ?? "CM") as Parameters<typeof currentQuality>[1]));
      // campeão da 1.ª Liga (concentração de títulos)
      const plLeague = clubs.find((c) => tierOf(c.league) === "PL")?.league ?? "";
      const table = repository.standings(plLeague, season);
      const champion = [...table].sort((a, b) => b.points - a.points || (b.scoredGoals - b.concededGoals) - (a.scoredGoals - a.concededGoals) || (a.club < b.club ? -1 : 1))[0]?.club ?? "";
      const active = repository.companies({ state: "active" }).length;
      report.push({
        season, champion, moved, movedShare: moved / clubs.length,
        cash: Object.fromEntries([...byTier].map(([t, v]) => [t, { p10: quantile(v, 0.1), p50: quantile(v, 0.5), p90: quantile(v, 0.9), negative: v.filter((x) => x < 0).length / v.length }])),
        population: { min: Math.min(...ratios), p50: quantile(ratios, 0.5), max: Math.max(...ratios) },
        companies: active,
        quality: Object.fromEntries([...strength].map(([t, v]) => [t, { p10: quantile(v, 0.1), p50: quantile(v, 0.5), p90: quantile(v, 0.9) }])),
        free: { count: free.length, meanQuality: freeQ.reduce((a, b) => a + b, 0) / Math.max(1, freeQ.length), p90Quality: quantile(freeQ, 0.9) },
      });
      before = after;
      repository.setMeta("calib.report", JSON.stringify(report));
      if (process.env.CALIB_OUT) writeFileSync(process.env.CALIB_OUT, JSON.stringify(report, null, 1));
    }
    if (process.env.CALIB_OUT) writeFileSync(process.env.CALIB_OUT, JSON.stringify(report, null, 1));
    const titles = new Map<string, number>();
    for (const r of report as { champion?: string }[]) if (r.champion) titles.set(r.champion, (titles.get(r.champion) ?? 0) + 1);
    if (process.env.CALIB_OUT) writeFileSync(`${process.env.CALIB_OUT}.titles`, JSON.stringify([...titles].sort((a, b) => b[1] - a[1])));
    const last = report.at(-1) as { population: { min: number; max: number } };
    expect(last.population.min).toBeGreaterThan(0.4);
    expect(last.population.max).toBeLessThan(3);
    // Caixa: média das últimas 5 épocas (um escalão tem 20 clubes e uma só época oscila ±5 pontos por clube); alvo ~20 % de saldos negativos.
    const recent = (report as { cash: Record<string, { negative: number }> }[]).slice(-5);
    for (const tier of Object.keys(recent.at(-1)!.cash)) {
      const mean = recent.reduce((t, r) => t + (r.cash[tier]?.negative ?? 0), 0) / recent.length;
      expect(mean, tier).toBeLessThan(0.3);
    }
    // Títulos da 1.ª Liga: vários campeões e nenhum clube com mais de 60 % (só com épocas suficientes para fazer sentido).
    if (SEASONS >= 20) {
      expect(titles.size, "campeões diferentes").toBeGreaterThanOrEqual(3);
      expect(Math.max(...titles.values()) / report.length, "quota do maior campeão").toBeLessThan(0.6);
    }
  }, 7_200_000);
});
