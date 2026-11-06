import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { nextUnplayed } from "./planView";

describe("próximo jogo por jogar", () => {
  it("dois jogos no mesmo dia: depois de jogar o primeiro, o segundo continua a ser o de hoje", () => {
    const r = new MemoryRepository();
    r.saveCalendar([
      { id: "a-liga", competition: "Liga", season: 1, round: 5, date: "2026-10-21", home: "x", away: "y" },
      { id: "b-taca", competition: "Taça", season: 1, round: 1, date: "2026-10-21", home: "z", away: "x" },
      { id: "c-liga", competition: "Liga", season: 1, round: 6, date: "2026-10-24", home: "x", away: "w" },
    ], []);
    expect(nextUnplayed(r, "x", "2026-10-21")?.id).toBe("a-liga");
    r.recordMatch({ id: "a-liga", competition: "Liga", season: 1, round: 5, date: "2026-10-21", home: "x", away: "y", homeGoals: 0, awayGoals: 0 }, [], []);
    expect(nextUnplayed(r, "x", "2026-10-21")?.id).toBe("b-taca");
    r.recordMatch({ id: "b-taca", competition: "Taça", season: 1, round: 1, date: "2026-10-21", home: "z", away: "x", homeGoals: 0, awayGoals: 0 }, [], []);
    expect(nextUnplayed(r, "x", "2026-10-21")?.id).toBe("c-liga");
  });
});
