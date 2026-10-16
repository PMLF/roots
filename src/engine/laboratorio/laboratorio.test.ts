import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistencia/repositorioMemoria";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos: Servicos = {
  openRepository: (() => { const repository = new MemoryRepository(); return async () => ({ repository, backend: "memory" as const, sqliteVersion: "teste" }); })(),
  loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
};

describe("laboratório", () => {
  it("lista as competições e simula um jogo e uma liga sem gravar nada", async () => {
    await handle({ id: 1, type: "createWorld", input: { seed: "lab" } }, servicos);
    const { repository } = await servicos.openRepository();
    const events = repository.eventsTotal();

    const comps = await handle({ id: 2, type: "competitions", input: null }, servicos);
    expect(comps[0]).toMatchObject({ tier: "firstLeague", clubs: 20 });
    expect(comps.length).toBeGreaterThan(10);

    const clubs = await handle({ id: 3, type: "clubs", input: null }, servicos);
    const [a, b] = clubs.filter((c) => c.league === comps[0]!.league) as [(typeof clubs)[0], (typeof clubs)[0]];
    const j = await handle({ id: 4, type: "matchLab", input: { home: a.id, away: b.id, seed: "s1", homeTactic: { formation: "4-4-2", style: "direct" } } }, servicos);
    expect(j.home.tactic).toMatchObject({ formation: "4-4-2", style: "direct" });
    expect(j.report.goals).toHaveLength(j.report.homeGoals + j.report.awayGoals);
    expect(j.lineups.home).toHaveLength(11);
    for (const p of j.lineups.home) expect(j.names[p.id]).toBeTruthy();
    for (const g of j.report.goals) expect(j.names[g.player]).toBeTruthy();
    // mesma seed, mesmo jogo; seed diferente, jogo (quase de certeza) diferente
    expect((await handle({ id: 5, type: "matchLab", input: { home: a.id, away: b.id, seed: "s1", homeTactic: { formation: "4-4-2", style: "direct" } } }, servicos)).report).toEqual(j.report);
    await expect(handle({ id: 6, type: "matchLab", input: { home: a.id, away: a.id, seed: "x" } }, servicos)).rejects.toThrow();

    const l = await handle({ id: 7, type: "leagueLab", input: { league: comps[0]!.league, seed: "s1" } }, servicos);
    expect(l.table).toHaveLength(20);
    expect(l.matches).toBe(20 * 19);
    expect(l.table.every((x) => x.matches === 38)).toBe(true);
    expect(l.table.map((x) => x.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(l.totals.goalsPerMatch).toBeGreaterThan(2);
    expect(l.totals.goalsPerMatch).toBeLessThan(3.4);
    expect(l.topScorers[0]!.goals).toBeGreaterThan(5);
    const district = comps.find((c) => c.tier === "district")!;
    const d = await handle({ id: 8, type: "leagueLab", input: { league: district.league, seed: "s1" } }, servicos);
    expect(d.table).toHaveLength(district.clubs);

    expect(repository.eventsTotal()).toBe(events); // nada foi gravado
  }, 60000);
});
