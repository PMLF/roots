import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { acceptFloor, answerRenewal, expiringPlayers, renewalAsk, setDecision } from "./renewals";
import { data, fresh, run } from "./testWorld.testlib";

const club = data.clubs.find((c) => c.tier === "thirdLeague")!;

describe("renovações do clube do gamer", () => {
  const repo = fresh("renewals");
  const squad = repo.clubPlayers(club.id).map((j) => j.person);
  const loyal = [...squad].sort((a, b) => (repo.person(b)?.personality.loyalty ?? 0) - (repo.person(a)?.personality.loyalty ?? 0));

  it("o pedido nunca fica abaixo de 95 % do ordenado atual e a duração vem dos parâmetros", () => {
    for (const p of squad.slice(0, 10)) {
      const ask = renewalAsk(repo, data, P, club, p)!;
      expect(ask.wage).toBeGreaterThanOrEqual(Math.floor((repo.contract(p)!.monthlyWage * 0.95) / 10) * 10);
      expect(ask.years).toBe(P.squadCycle.contracts.negotiation.askYears);
    }
  });
  it("o patamar baixa com a lealdade e fica entre o mínimo e 1", () => {
    const hi = acceptFloor(repo, P, club, loyal[0]!);
    const lo = acceptFloor(repo, P, club, loyal[loyal.length - 1]!);
    expect(hi).toBeLessThanOrEqual(lo);
    for (const f of [hi, lo]) {
      expect(f).toBeGreaterThanOrEqual(P.squadCycle.contracts.negotiation.floorMin);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it("aceita ofertas ao patamar e recusa abaixo dele", () => {
    const p = squad[0]!;
    const ask = renewalAsk(repo, data, P, club, p)!;
    const floor = acceptFloor(repo, P, club, p);
    expect(answerRenewal(repo, data, P, club, p, { wage: ask.wage, years: 2 })!.accepted).toBe(true);
    expect(answerRenewal(repo, data, P, club, p, { wage: Math.floor(ask.wage * floor * 0.9), years: 2 })!.accepted).toBe(false);
  });
  it("a decisão do gamer manda na passagem de época: renova com as condições dadas ou deixa sair", () => {
    const r = fresh("renewals-roll");
    const seasonStart = "2027-07-01";
    const ps = r.clubPlayers(club.id).map((j) => j.person).slice(0, 2);
    for (const p of ps) r.saveContract({ ...r.contract(p)!, end: "2027-06-30" });
    expect(expiringPlayers(r, club.id, seasonStart)).toEqual(expect.arrayContaining(ps));
    setDecision(r, 1, ps[0]!, { kind: "renew", wage: 4321 * 10 / 10, years: 3 });
    setDecision(r, 1, ps[1]!, { kind: "release" });
    run(r, 1, club.id);
    expect(r.contract(ps[0]!)?.club).toBe(club.id);
    expect(r.contract(ps[0]!)?.monthlyWage).toBe(4321);
    expect(r.player(ps[1]!)?.club ?? null).not.toBe(club.id);
  });
});
