import { describe, expect, it } from "vitest";
import { clubBudget, defaultBudget, ensureBudgets } from "../club/budget";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { decisionStates } from "../news/decisions";
import { inbox } from "../news/news";
import type { IsoDate } from "../persistence/types";
import { data, fresh } from "../squad/testWorld.testlib";
import { currentSeason } from "./seasonPyramid";
import { answerRenewal, endOfContract, ensureRenewalProposal, renewalOf } from "./coachMarket";
import { budgetCaps, contractOf, reply, referenceWage, signInitial, signRenewal } from "./gamerContract";
import { acceptableRatio } from "./gamerContract";

const club = data.clubs.find((c) => c.tier === "thirdLeague")!;
const day0 = "2027-07-01" as IsoDate;
const setup = (seed: string) => {
  const repo = fresh(seed);
  repo.setMeta("gamer.club", club.id);
  repo.setMeta("date.today", day0);
  signInitial(repo, P, club, day0);
  return repo;
};

describe("orçamento de plantel no contrato (RZ-161)", { timeout: 120000 }, () => {
  it("o presidente dá até ao teto que a aceitação permite; acima disso contrapropõe", () => {
    const repo = setup("sb-a");
    const { max } = acceptableRatio(repo, data, P, club, day0, true);
    const caps = budgetCaps(P, max);
    expect(caps.wage).toBeGreaterThanOrEqual(1);
    expect(caps.wage).toBeLessThanOrEqual(P.coach.contract.budget.maxWage);
    const wage = referenceWage(club, P);
    const ok = reply(repo, data, P, club, day0, true, { monthlyWage: wage, years: 2, budget: { wage: caps.wage, transfers: caps.transfers } });
    expect(ok.result).toBe("accepted");
    const greedy = reply(repo, data, P, club, day0, true, { monthlyWage: wage, years: 2, budget: { wage: caps.wage + 0.5, transfers: caps.transfers + 1 } });
    expect(greedy.result).toBe("counter");
    if (greedy.result === "counter") {
      expect(greedy).toMatchObject({ reason: "squad" });
      expect(greedy.terms.budget!.wage).toBeCloseTo(caps.wage);
      expect(greedy.terms.budget!.transfers).toBeCloseTo(caps.transfers);
    }
  });

  it("o orçamento acordado passa a valer já e em cada época do contrato", () => {
    const repo = setup("sb-b");
    const season = currentSeason(repo);
    ensureBudgets(repo, data, P, season);
    const def = defaultBudget(repo, club, P, season);
    signRenewal(repo, P, club, day0, { monthlyWage: referenceWage(club, P), years: 2, budget: { wage: 1.2, transfers: 1.5 } });
    const now = clubBudget(repo, club, P, season);
    expect(now.wageBillMax).toBeGreaterThan(def.wageBillMax);
    expect(contractOf(repo)!.budget).toEqual({ wage: 1.2, transfers: 1.5 });
    // nova época: o orçamento por defeito é refeito e o acordado volta a aplicar-se
    repo.setMeta("budget.season", "");
    ensureBudgets(repo, data, P, season + 1);
    expect(clubBudget(repo, club, P, season + 1).wageBillMax).toBeGreaterThan(defaultBudget(repo, club, P, season + 1).wageBillMax);
  });
});

describe("proposta de renovação na caixa (RZ-164)", { timeout: 120000 }, () => {
  const near = "2029-03-01" as IsoDate; // dentro dos 180 dias do aviso (o contrato acaba a 2029-07-01)

  it("o presidente propõe uma vez, dentro do aviso; aceitar renova já", () => {
    const repo = setup("rn-a");
    repo.setMeta("gamer.grudge", "");
    expect(ensureRenewalProposal(repo, data, P, "2028-01-01" as IsoDate)).toBeUndefined();
    const r = ensureRenewalProposal(repo, data, P, near);
    expect(r).toBeDefined();
    expect(ensureRenewalProposal(repo, data, P, "2029-03-02" as IsoDate)).toEqual(r);
    const msg = inbox(repo, data, { limit: 50 }).messages.find((m) => m.type === "contract_proposal");
    expect(msg).toBeDefined();
    expect(Object.values(decisionStates(repo)).some((d) => d.kind === "renewal" && d.state === "pending")).toBe(true);
    const oldEnd = contractOf(repo)!.end;
    answerRenewal(repo, data, P, near, true);
    expect(contractOf(repo)!.end > oldEnd).toBe(true);
    expect(Object.values(decisionStates(repo)).some((d) => d.kind === "renewal" && d.state === "answered" && d.answer === "accepted")).toBe(true);
  });

  it("recusar a proposta deixa o contrato caducar no fim", () => {
    const repo = setup("rn-b");
    const r = ensureRenewalProposal(repo, data, P, near);
    expect(r).toBeDefined();
    answerRenewal(repo, data, P, near, false);
    expect(renewalOf(repo)!.status).toBe("declined");
    expect(endOfContract(repo, data, P, contractOf(repo)!.end)).toBe("left");
    expect(repo.meta("gamer.club")).toBe("");
  });

  it("sem proposta pendente não há o que responder", () => {
    const repo = setup("rn-c");
    expect(() => answerRenewal(repo, data, P, near, true)).toThrow();
  });
});
