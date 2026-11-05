import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { bankOf } from "../personal/bank";
import { data, fresh } from "../squad/testWorld.testlib";
import { grudgeNow, signInitial } from "./gamerContract";
import { ensureObjective, objectiveOf, settleObjective } from "./gamerObjective";

const club = data.clubs.find((c) => c.tier === "firstLeague")!;
const day0 = "2027-07-01" as never;
const setup = (seed: string) => {
  const repo = fresh(seed);
  repo.setMeta("gamer.club", club.id);
  signInitial(repo, P, club, day0);
  return repo;
};
/** Repositório com a classificação final inventada: o clube do gamer na posição `rank`. */
const withTable = (repo: ReturnType<typeof fresh>, rank: number) => {
  const others = data.clubs.filter((c) => c.league === club.league && c.id !== club.id).map((c) => c.id);
  const order = [...others.slice(0, rank - 1), club.id, ...others.slice(rank - 1)];
  const lines = order.map((id) => ({ club: id }));
  return Object.assign(Object.create(repo), { standings: () => lines }) as typeof repo;
};

describe("objetivo da época do gamer (RZ-161)", { timeout: 120000 }, () => {
  it("o objetivo vem da posição esperada pela reputação e é estável", () => {
    const repo = setup("obj-a");
    const o = ensureObjective(repo, data, P)!;
    const expected = data.clubs.filter((c) => c.league === club.league).sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1)).findIndex((c) => c.id === club.id) + 1;
    expect(o.rank).toBe(Math.max(1, Math.round(expected * P.coach.contract.objective.stretch)));
    expect(o.rank).toBeLessThanOrEqual(expected);
    expect(o.of).toBe(data.clubs.filter((c) => c.league === club.league).length);
    expect(o.bonus).toBe(Math.round((contractWage(repo) * P.coach.contract.objective.bonusMonths) / 10) * 10);
    expect(ensureObjective(repo, data, P)).toEqual(o);
    expect(objectiveOf(repo)).toEqual(o);
  });

  it("cumprir dá o bónus na conta e confiança; o objetivo fecha", () => {
    const repo = setup("obj-c");
    const o = ensureObjective(repo, data, P)!;
    const before = bankOf(repo, P, day0).balance;
    repo.setMeta("gamer.grudge", JSON.stringify({ value: 0.3, date: day0 }));
    const r = settleObjective(withTable(repo, o.rank), P, day0, 1)!;
    expect(r).toMatchObject({ met: true, rank: o.rank, target: o.rank, bonus: o.bonus });
    expect(bankOf(repo, P, day0).balance).toBe(before + o.bonus);
    expect(grudgeNow(repo, P, day0)).toBeCloseTo(0.3 - P.coach.contract.objective.trustGain);
    expect(objectiveOf(repo)).toBeUndefined();
  });

  it("falhar deixa ressentimento e não paga nada", () => {
    const repo = setup("obj-d");
    const o = ensureObjective(repo, data, P)!;
    const before = bankOf(repo, P, day0).balance;
    const worse = Math.min(o.of, o.rank + 3);
    const r = settleObjective(withTable(repo, worse), P, day0, 1)!;
    expect(r).toMatchObject({ met: false, rank: worse, bonus: 0 });
    expect(bankOf(repo, P, day0).balance).toBe(before);
    expect(grudgeNow(repo, P, day0)).toBeCloseTo(P.coach.contract.objective.missGrudge);
  });

  it("sem contrato não há objetivo", () => {
    const repo = fresh("obj-b");
    repo.setMeta("gamer.club", club.id);
    expect(ensureObjective(repo, data, P)).toBeUndefined();
  });
});

function contractWage(repo: ReturnType<typeof fresh>): number {
  return JSON.parse(repo.meta("gamer.contract")!).monthlyWage as number;
}
