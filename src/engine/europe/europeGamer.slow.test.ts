import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { CHAMPIONS_LEAGUE } from "./europe";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("clube do gamer na Europa (RZ-246)", () => {
  it("joga a fase de liga da Liga dos Campeões contra um clube estrangeiro, ao vivo, e aparece nas cores e nos jogos recentes", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "europe-gamer" } }, s);
    const { repository: repo } = await s.openRepository();
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    expect((await handle({ id: 5, type: "clubColours", input: null }, s)).some((c) => c.id.startsWith("x-"))).toBe(true);
    const top = clubs.filter((c) => c.league === "Primeira Liga").sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    // sem reputação nos resumos, escolhe-se o 1.º classificado pela mesma ordem usada pelo motor
    const chosen = (await handle({ id: 3, type: "competitionPage", input: { league: top!.league } }, s))!.table[0]!.club;
    await handle({ id: 4, type: "chooseClub", input: { id: chosen } }, s);
    let played = false;
    for (let i = 0; i < 120 && !played; i++) {
      const r = await handle({ id: 100 + i * 4, type: "advance", input: { mode: "nextMatch" } }, s);
      if (!r.pause) continue;
      const inEurope = repo.calendar(CHAMPIONS_LEAGUE, 1).matches.some((g) => g.id === r.pause!.match);
      if (inEurope) {
        const live = await handle({ id: 101 + i * 4, type: "startMatch", input: { match: r.pause.match } }, s);
        expect(live).toBeDefined();
        await handle({ id: 102 + i * 4, type: "matchStep", input: { minutes: 130 } }, s);
        played = repo.match(r.pause.match) !== undefined;
      } else {
        await handle({ id: 101 + i * 4, type: "confirmMatch", input: { match: r.pause.match } }, s);
      }
      await handle({ id: 103 + i * 4, type: "advance", input: { mode: "day" } }, s);
    }
    expect(played).toBe(true);
    const recent = await handle({ id: 9000, type: "recentMatches", input: { club: chosen, limit: 3 } }, s);
    expect(recent.some((m) => m.short === "championsLeague")).toBe(true);
  }, 480000);
});
