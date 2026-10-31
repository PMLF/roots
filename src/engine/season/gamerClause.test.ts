import type { IsoDate } from "../persistence/types";
import { describe, expect, it } from "vitest";
import { coachRound, gamerConfidence } from "../club/coaches";
import { clubBalance } from "../club/finances";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { bankOf, deposit } from "../personal/bank";
import { data, fresh } from "../squad/testWorld.testlib";
import { clauseAmount, contractOf, reply, referenceWage, signInitial } from "./gamerContract";
import { resign, resignCost, sackByResults } from "./coachMarket";

const club = data.clubs.find((c) => c.tier === "firstLeague")!;
const day0 = "2027-07-01" as IsoDate;
const setup = (seed: string) => {
  const repo = fresh(seed);
  repo.setMeta("gamer.club", club.id);
  repo.setMeta("date.today", day0);
  signInitial(repo, P, club, day0);
  return repo;
};

describe("cláusula de rescisão do gamer (RZ-210)", { timeout: 120000 }, () => {
  it("o contrato inicial tem a cláusula por omissão", () => {
    const repo = setup("cl-a");
    const c = contractOf(repo)!;
    expect(c.clauseMonths).toBe(P.coach.contract.clause.defaultMonths);
    expect(clauseAmount(P, c)).toBe(c.monthlyWage * P.coach.contract.clause.defaultMonths);
  });

  it("uma cláusula maior custa salário na negociação; uma menor alivia", () => {
    const repo = setup("cl-b");
    const ref = referenceWage(club, P);
    const wage = Math.round(ref * 1.2 / 10) * 10;
    const at = (m: number) => reply(repo, data, P, club, day0, true, { monthlyWage: wage, years: 2, clauseMonths: m });
    const low = at(1), high = at(12);
    const rank = { accepted: 0, counter: 1, refused: 2 } as const;
    expect(rank[high.result]).toBeGreaterThanOrEqual(rank[low.result]);
    expect(high.result === "accepted" ? high.terms.clauseMonths : 12).toBe(12);
    const hi = at(12);
    if (hi.result === "counter") expect(hi.terms.monthlyWage).toBeLessThan(wage);
  });

  it("despedido por resultados: o clube paga a cláusula ao gamer e o gamer fica sem clube", () => {
    const repo = setup("cl-c");
    const c = contractOf(repo)!;
    const bank = bankOf(repo, P, day0).balance, cash = clubBalance(repo, club);
    sackByResults(repo, data, P, club.id, day0, 2027);
    expect(repo.meta("gamer.club")).toBe("");
    expect(repo.meta("gamer.previous")).toBe(club.id);
    expect(bankOf(repo, P, day0).balance).toBe(bank + clauseAmount(P, c));
    expect(clubBalance(repo, club)).toBe(cash - clauseAmount(P, c));
    expect(repo.eventsOf({ k: "club", id: club.id }).filter((e) => e.type === "GAMER_RESIGNATION").some((e) => (e.data as { reason?: string }).reason === "results")).toBe(true);
  });

  it("demitir-se antes do fim paga a cláusula (no máximo o saldo); depois do fim não paga nada", () => {
    const rich = setup("cl-d");
    deposit(rich, P, day0, 1_000_000);
    const c = contractOf(rich)!;
    expect(resignCost(rich, P, day0)).toBe(clauseAmount(P, c));
    const before = bankOf(rich, P, day0).balance;
    expect(resign(rich, data, P).paid).toBe(clauseAmount(P, c));
    expect(bankOf(rich, P, day0).balance).toBe(before - clauseAmount(P, c));

    const poor = setup("cl-e");
    poor.setMeta("gamer.bank", JSON.stringify({ balance: 100, upTo: day0.slice(0, 7) }));
    expect(resignCost(poor, P, day0)).toBe(100);

    const ended = setup("cl-f");
    expect(resignCost(ended, P, contractOf(ended)!.end)).toBe(0);
  });

  it("a direção despede o gamer quando a confiança cai (resultados abaixo do esperado)", () => {
    const repo = setup("cl-g");
    const params = { ...P, coach: { ...P.coach, board: { ...P.coach.board, sackProbability: 1, graceDays: 0, minMatches: 1 } } };
    const peers = data.clubs.filter((c) => c.league === club.league);
    // o clube do gamer em último, os outros por ordem; várias rondas seguidas
    const lines = peers.map((c, i) => ({ club: c.id, matches: 20, points: c.id === club.id ? 0 : 60 - i, scoredGoals: 10, concededGoals: 10 }));
    const view = Object.assign(Object.create(repo), { standings: () => lines }) as typeof repo;
    for (let w = 0; w < 30 && repo.meta("gamer.club"); w++) coachRound(view, data, params, `2027-0${8 + (w % 1)}-01` as never, 2027, club.id);
    expect(repo.meta("gamer.club")).toBe("");
    expect(gamerConfidence(repo, club.id)).toBeUndefined();
  });
});
