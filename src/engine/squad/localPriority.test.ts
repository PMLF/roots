import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { interestedClubs } from "../market/interest";
import { data, fresh, run } from "./testWorld.testlib";
import { localBlock, lockLocalSigning, pruneLocks, readLocks } from "./localPriority";

const repo = fresh("local-priority");
run(repo, 1);
const today = "2027-07-01" as const;
const prospects = repo.playersByState("prospect");
const cityOf = (id: string) => repo.person(id)?.birthCity;
const otherCityClub = (city: string | undefined) => data.clubs.find((c) => c.city !== city)!;
const homeClub = (city: string | undefined) => data.clubs.find((c) => c.city === city);

describe("prioridade da terra (RZ-256)", () => {
  it("jovem livre da terra: só os clubes da cidade o podem contratar", () => {
    const j = prospects.find((p) => homeClub(cityOf(p.person)));
    if (!j) return;
    const city = cityOf(j.person);
    expect(localBlock(repo, j.person, otherCityClub(city), today)).toBe("prospect");
    expect(localBlock(repo, j.person, homeClub(city)!, today)).toBeUndefined();
  });

  it("quem assina por um clube da terra fica meia época fechado a outras cidades", () => {
    const j = repo.playersByState("active").find((p) => repo.person(p.person)?.birthCity && repo.player(p.person)?.club);
    if (!j) throw new Error("sem jogador");
    const city = cityOf(j.person);
    lockLocalSigning(repo, P, j.person, today);
    const until = readLocks(repo)[j.person]!;
    expect(localBlock(repo, j.person, otherCityClub(city), today)).toBe("locked");
    expect(localBlock(repo, j.person, otherCityClub(city), until)).toBeUndefined();
    pruneLocks(repo, until);
    expect(readLocks(repo)[j.person]).toBeUndefined();
  });

  it("interesse: determinístico, sem o próprio clube e sem clubes bloqueados", () => {
    const j = prospects.find((p) => homeClub(cityOf(p.person)));
    if (!j) return;
    const a = interestedClubs(repo, data, P, j.person, today);
    expect(a).toEqual(interestedClubs(repo, data, P, j.person, today));
    const city = cityOf(j.person);
    for (const x of a) expect(data.clubs.find((c) => c.id === x.club)!.city).toBe(city);
    const active = repo.playersByState("active")[0]!;
    const own = interestedClubs(repo, data, P, active.person, today);
    expect(own.length).toBeLessThanOrEqual(6);
    expect(own.some((x) => x.club === active.club)).toBe(false);
  });
});
