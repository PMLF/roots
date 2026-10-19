import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { matchWinner } from "../persistence/types";
import { CUP } from "./competitions";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("Taça e histórico das competições (RZ-244)", () => {
  it("sem empates, meias-finais a duas mãos, vista da taça, competições do clube e histórico", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "cup-history" } }, s);
    const { repository: repo } = await s.openRepository();
    let end = false, keeps = 0, summary: Awaited<ReturnType<typeof handle<"advance">>>["seasonSummary"];
    while (!end && keeps++ < 80) {
      const r = await handle({ id: 2, type: "advance", input: { mode: "week" } }, s);
      end = r.seasonEnd;
      summary = r.seasonSummary;
    }
    expect(end).toBe(true);
    // nenhum jogo da Taça acaba sem vencedor (prolongamento e penáltis) — as meias-finais decidem-se pelo agregado
    const games = repo.competitionMatches(CUP, 1);
    const cup = (await handle({ id: 3, type: "cupView", input: { competition: CUP, season: 1 } }, s))!;
    const semis = cup.rounds.filter((r) => r.key === "semi");
    expect(semis).toHaveLength(2);
    expect(semis.map((r) => r.leg)).toEqual([1, 2]);
    expect(cup.rounds.at(-1)!.key).toBe("final");
    for (const r of cup.rounds.filter((x) => x.leg !== 1)) {
      for (const m of r.matches) {
        const rec = repo.competitionMatches(CUP, 1).find((x) => x.id === m.id)!;
        const first = semis[0]?.matches.find((x) => x.home === rec.away && x.away === rec.home);
        const aggregate = first ? [rec.homeGoals + (first.awayGoals ?? 0), rec.awayGoals + (first.homeGoals ?? 0)] : [rec.homeGoals, rec.awayGoals];
        expect(aggregate[0] !== aggregate[1] || matchWinner(rec) !== undefined).toBe(true);
      }
    }
    for (const m of games.filter((g) => !semis.some((r) => r.matches.some((x) => x.id === g.id)))) expect(matchWinner(m)).toBeDefined();
    expect(cup.done).toBe(true);
    expect(cup.winner).toBeDefined();
    expect((await handle({ id: 4, type: "nationalCups", input: null }, s)).some((c) => c.competition === CUP)).toBe(true);
    // o vencedor sabe que ganhou a taça; todos os clubes da Primeira Liga têm a liga com posição
    const mine = await handle({ id: 5, type: "clubCompetitions", input: { club: cup.winner!.club, season: 1 } }, s);
    expect(mine.find((c) => c.competition === CUP)?.status).toBe("champion");
    expect(mine.find((c) => c.kind === "league")?.position).toBeGreaterThan(0);
    // histórico da liga: um pódio e os melhores marcadores; da taça: o vencedor
    const champion = summary!.champions.find((x) => x.league === "Primeira Liga")!.club;
    const history = await handle({ id: 6, type: "competitionHistory", input: { competition: "Primeira Liga" } }, s);
    expect(history.seasonCount).toBe(1);
    expect(history.seasons[0]!.podium).toHaveLength(3);
    expect(history.seasons[0]!.podium[0]!.club).toBe(champion);
    expect(history.titles[0]!.club).toBe(champion);
    expect(history.scorers.length).toBeGreaterThan(0);
    expect(history.records.bestPoints?.value).toBeGreaterThan(0);
    expect(history.records.biggestWin).toBeDefined();
    const cupHistory = await handle({ id: 7, type: "competitionHistory", input: { competition: CUP } }, s);
    expect(cupHistory.cup).toBe(true);
    expect(cupHistory.titles[0]!.club).toBe(cup.winner!.club);
  }, 240000);
});
