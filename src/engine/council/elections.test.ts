import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { addDays } from "../calendar/dates";
import { data, fresh } from "../squad/testWorld.testlib";
import { mayorOf } from "./agenda";
import { campaignPending, dailyElections, electionOf, supportCandidate, termsOf } from "./elections";
import { relationOf } from "./relation";
import type { IsoDate } from "../persistence/types";

const club = data.clubs.find((c) => c.tier === "district")!;
const EL = P.city.council.election;
const day = (y: number) => `${y}-${String(EL.month).padStart(2, "0")}-${String(EL.day).padStart(2, "0")}` as IsoDate;
const election = P.city.sinceTerm + P.city.yearsMunicipalElections;

/** Corre os dias desde `from` até `to` (inclusive). */
function run(repo: ReturnType<typeof fresh>, from: IsoDate, to: IsoDate, gamer = club): void {
  for (let d = from; d <= to; d = addDays(d, 1)) dailyElections(repo, data, P, gamer, d, 4);
}

describe("eleições autárquicas (RZ-236B)", { timeout: 180000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("a campanha abre antes do dia, com 2 a 4 candidatos por cidade", () => {
    const repo = fresh("elect-a");
    run(repo, addDays(day(election), -EL.campaignDays - 3), addDays(day(election), -EL.campaignDays));
    const e = electionOf(repo)!;
    expect(e.stage).toBe("campaign");
    for (const list of Object.values(e.cities)) { expect(list.length).toBeGreaterThanOrEqual(2); expect(list.length).toBeLessThanOrEqual(4); }
    expect(campaignPending(repo, club)).toBeDefined();
    // um candidato novo existe como pessoa
    const some = Object.values(e.cities).flat().find((c) => c.k === "new")!;
    expect(repo.person(some.p)).toBeDefined();
  });

  it("no dia das eleições todas as cidades têm autarca entre os candidatos e o mandato novo abre", () => {
    const repo = fresh("elect-b");
    const before = new Map(data.cities.map((c) => [c.id, mayorOf(repo, data, c.id)!.person]));
    run(repo, addDays(day(election), -EL.campaignDays), day(election));
    const e = electionOf(repo)!;
    expect(e.stage).toBe("done");
    let changed = 0;
    for (const c of data.cities) {
      const m = mayorOf(repo, data, c.id)!;
      expect(e.cities[c.id]!.map((x) => x.p)).toContain(m.person);
      if (m.person !== before.get(c.id)) { changed++; expect(termsOf(repo, data, P, c.id).at(-1)!.person).toBe(m.person); }
    }
    // nem ninguém é sempre reeleito, nem todos mudam
    expect(changed).toBeGreaterThan(data.cities.length * 0.1);
    expect(changed).toBeLessThan(data.cities.length * 0.95);
  });

  it("é determinístico", () => {
    const a = fresh("elect-c"), b = fresh("elect-c");
    run(a, addDays(day(election), -EL.campaignDays), day(election));
    run(b, addDays(day(election), -EL.campaignDays), day(election));
    for (const c of data.cities.slice(0, 40)) expect(mayorOf(a, data, c.id)!.person).toBe(mayorOf(b, data, c.id)!.person);
  });

  it("apoiar o vencedor sobe a relação; o apoio só vale uma vez", () => {
    const repo = fresh("elect-d");
    run(repo, addDays(day(election), -EL.campaignDays), addDays(day(election), -1));
    const list = electionOf(repo)!.cities[club.city]!;
    expect(supportCandidate(repo, data, club, "ghost")).toEqual({ ok: false });
    expect(supportCandidate(repo, data, club, list[0]!.p)).toEqual({ ok: true });
    expect(supportCandidate(repo, data, club, "neutral")).toEqual({ ok: false });
    expect(campaignPending(repo, club)).toBeUndefined();
    run(repo, day(election), day(election));
    const winner = mayorOf(repo, data, club.city)!.person;
    const rel = relationOf(repo, P, winner);
    if (winner === list[0]!.p) expect(rel.value).toBeGreaterThan(P.city.council.relation.start);
    else expect(rel.value).toBeLessThan(P.city.council.relation.start);
    expect(repo.eventsOf({ k: "club", id: club.id }).some((e) => e.type === "ELECTION_RESULT")).toBe(true);
  });

  it("sem decisão do gamer, o dia chega e conta como neutro; a seguinte só vem 4 anos depois", () => {
    const repo = fresh("elect-e");
    run(repo, addDays(day(election), -EL.campaignDays), day(election));
    expect(electionOf(repo)!.stage).toBe("done");
    run(repo, addDays(day(election), 1), addDays(day(election + P.city.yearsMunicipalElections), -EL.campaignDays - 1));
    expect(electionOf(repo)!.year).toBe(election);
    run(repo, addDays(day(election + P.city.yearsMunicipalElections), -EL.campaignDays), addDays(day(election + P.city.yearsMunicipalElections), -EL.campaignDays));
    expect(electionOf(repo)!.year).toBe(election + P.city.yearsMunicipalElections);
  });
});
