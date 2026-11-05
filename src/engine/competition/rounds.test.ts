import { describe, expect, it } from "vitest";
import type { ScheduledMatch } from "../persistence/types";
import { competitionState, matchesForPlay } from "./rounds";

const ag = (id: string, round: number, date: string, competition = "PL", season = 1): ScheduledMatch => ({ id, competition, season, round, date, home: `c${id}`, away: `f${id}` });
const cal = [ag("a1", 1, "2026-09-05"), ag("a2", 1, "2026-09-06"), ag("b1", 2, "2026-09-12"), ag("b2", 2, "2026-09-12"), ag("c1", 3, "2026-09-19"), ag("x", 1, "2026-09-05", "TP"), ag("y", 1, "2027-09-05", "PL", 2)];

describe("controlo de jornadas", () => {
  it("antes de começar: jornada 1, nada em atraso, nada jogado", () => {
    const e = competitionState("PL", 1, cal, new Set(), "2026-08-30");
    expect(e).toMatchObject({ totalMatches: 5, playedMatches: 0, matchesPerPlay: 5, finished: false, currentRound: 1, nextDate: "2026-09-05" });
    expect(e.inDelay).toEqual([]);
    expect(e.rounds.map((j) => [j.round, j.matches, j.full])).toEqual([[1, 2, false], [2, 2, false], [3, 1, false]]);
  });

  it("só conta a competição e a época pedidas", () => {
    expect(competitionState("TP", 1, cal, new Set(), "2026-08-30").totalMatches).toBe(1);
    expect(competitionState("PL", 2, cal, new Set(), "2026-08-30").totalMatches).toBe(1);
    expect(competitionState("XX", 1, cal, new Set(), "2026-08-30")).toMatchObject({ totalMatches: 0, finished: false });
  });

  it("jornada atual avança; atrasos são os jogos com data passada por jogar", () => {
    const e = competitionState("PL", 1, cal, new Set(["a1", "a2", "b1"]), "2026-09-14");
    expect(e.currentRound).toBe(2);
    expect(e.playedMatches).toBe(3);
    expect(e.inDelay.map((j) => j.id)).toEqual(["b2"]);
    expect(e.rounds.find((j) => j.round === 2)).toMatchObject({ played: 1, full: false, inDelay: 1 });
    expect(e.nextDate).toBe("2026-09-12");
  });

  it("termina quando tudo foi jogado", () => {
    const e = competitionState("PL", 1, cal, new Set(["a1", "a2", "b1", "b2", "c1"]), "2027-01-01");
    expect(e).toMatchObject({ finished: true, matchesPerPlay: 0 });
    expect(e.currentRound).toBeUndefined();
    expect(e.nextDate).toBeUndefined();
  });

  it("jogos para jogar: até hoje inclusive, por data e jornada, os atrasados primeiro", () => {
    const j = matchesForPlay(cal, new Set(["a1"]), "2026-09-12");
    expect(j.map((x) => x.id)).toEqual(["x", "a2", "b1", "b2"]);
    expect(matchesForPlay(cal, new Set(), "2026-09-04")).toEqual([]);
  });
});
