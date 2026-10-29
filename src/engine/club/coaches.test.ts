import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { coachOf, coachRound, coachSeasonEnd } from "./coaches";

const free = (repo: ReturnType<typeof fresh>) => repo.roleHolders("coach").filter((id) => repo.role(id)?.club === undefined);
const clubsWithCoach = (repo: ReturnType<typeof fresh>) => data.clubs.filter((c) => coachOf(repo, c.id) !== undefined).length;

describe("treinadores da IA (RZ-210)", () => {
  it("o clube do gamer não tem treinador da IA e, ao sair, procura um livre", () => {
    const repo = fresh("treinadores-gamer");
    const club = data.clubs.find((c) => c.tier === "firstLeague")!.id;
    const before = clubsWithCoach(repo);
    const freeBefore = free(repo).length;
    expect(coachOf(repo, club)).toBeDefined();
    coachRound(repo, data, P, "2026-07-06", 1, club);
    expect(coachOf(repo, club)).toBeUndefined();
    expect(free(repo).length).toBe(freeBefore + 1);
    expect(clubsWithCoach(repo)).toBe(before - 1);
    // o gamer sai: o clube fica à procura e, passada a interinidade, contrata
    coachRound(repo, data, P, "2026-07-13", 1);
    expect(coachOf(repo, club)).toBeUndefined();
    coachRound(repo, data, P, "2026-07-20", 1);
    expect(coachOf(repo, club)).toBeDefined();
    expect(repo.eventsOf({ k: "club", id: club }, { type: "COACH_HIRED" }).length).toBe(1);
  });
  it("quem desce é despedido e o clube contrata outro; ninguém fica com dois treinadores", () => {
    const repo = fresh("treinadores-despedimento");
    const p = { ...P, coach: { ...P.coach, board: { ...P.coach.board, sackRelegated: 1 } } };
    const club = data.clubs.find((c) => c.tier === "secondLeague")!;
    const old = coachOf(repo, club.id)!;
    coachSeasonEnd(repo, data, p, 1, "2027-05-30", [{ club: club.id, tier: "secondLeague", position: 18, size: 20 }], new Map([[club.id, "thirdLeague"]]));
    expect(coachOf(repo, club.id)).toBeUndefined();
    expect(repo.role(old)?.club).toBeUndefined();
    expect(repo.eventsOf({ k: "club", id: club.id }, { type: "COACH_SACKED" })[0]?.data).toMatchObject({ reason: "relegation" });
    coachRound(repo, data, p, "2027-06-07", 2);
    const hired = coachOf(repo, club.id);
    expect(hired).toBeDefined();
    expect(hired).not.toBe(old);
    // cada treinador está, no máximo, num clube
    const at = repo.roleHolders("coach").map((id) => repo.role(id)?.club).filter((c): c is string => !!c);
    expect(new Set(at).size).toBe(at.length);
  });
  it("sem classificação não há despedimentos: tudo fica como estava", () => {
    const repo = fresh("treinadores-quietos");
    const snapshot = JSON.stringify(data.clubs.map((c) => coachOf(repo, c.id)));
    coachRound(repo, data, P, "2026-07-06", 1);
    coachRound(repo, data, P, "2026-07-13", 1);
    expect(JSON.stringify(data.clubs.map((c) => coachOf(repo, c.id)))).toBe(snapshot);
  });
});
