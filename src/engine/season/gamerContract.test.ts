import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { askRaise, contractOf, grudgeNow, negotiateOffer, reply, referenceWage, signInitial } from "./gamerContract";

const club = data.clubs.find((c) => c.tier === "thirdLeague")!;
const big = data.clubs.filter((c) => c.tier === "firstLeague").sort((a, b) => b.reputation - a.reputation)[0]!;
const day0 = "2027-07-01" as never;

describe("contrato do gamer (RZ-161)", { timeout: 120000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("o salário de referência cresce com o escalão e a reputação", () => {
    expect(referenceWage(big, P)).toBeGreaterThan(referenceWage(club, P));
    const rich = { ...club, reputation: club.reputation * 1.4 };
    expect(referenceWage(rich, P)).toBeGreaterThan(referenceWage(club, P));
  });

  it("o presidente aceita o salário de referência, contrapropõe um pouco acima e recusa muito acima", () => {
    const repo = fresh("contract-a");
    const ref = referenceWage(club, P);
    expect(reply(repo, data, P, club, day0, false, { monthlyWage: ref, years: 2 }).result).toBe("accepted");
    const mid = reply(repo, data, P, club, day0, false, { monthlyWage: Math.round(ref * 1.6), years: 2 });
    const huge = reply(repo, data, P, club, day0, false, { monthlyWage: ref * 5, years: 2 });
    expect(["counter", "accepted", "refused"]).toContain(mid.result);
    expect(huge.result).toBe("refused");
    // determinístico
    expect(reply(repo, data, P, club, day0, false, { monthlyWage: ref * 5, years: 2 })).toEqual(huge);
    if (mid.result === "counter") expect(mid.terms.monthlyWage).toBeLessThan(Math.round(ref * 1.6));
  });

  it("recusar cria ressentimento que desce o que o presidente aceita", () => {
    const repo = fresh("contract-b");
    const ref = referenceWage(club, P);
    expect(grudgeNow(repo, P, day0)).toBe(0);
    const r = negotiateOffer(repo, data, P, club.id, day0, { monthlyWage: ref * 5, years: 2 });
    expect(r.result).toBe("refused");
    expect(grudgeNow(repo, P, day0)).toBeCloseTo(P.coach.contract.grudgeStep);
    expect(grudgeNow(repo, P, "2028-07-01" as never)).toBeLessThan(P.coach.contract.grudgeStep);
  });

  it("aumento: só depois de um tempo no clube, com intervalo entre pedidos", () => {
    const repo = fresh("contract-c");
    repo.setMeta("gamer.club", club.id);
    signInitial(repo, P, club, day0);
    expect(contractOf(repo)?.monthlyWage).toBe(referenceWage(club, P));
    const ask = { monthlyWage: referenceWage(club, P) * 5, years: 2 };
    expect(askRaise(repo, data, P, "2027-07-20" as never, ask)).toEqual({ result: "refused", reason: "tenure" });
    const first = askRaise(repo, data, P, "2027-11-01" as never, ask);
    expect(first.result).toBe("refused");
    expect(askRaise(repo, data, P, "2027-11-20" as never, ask)).toEqual({ result: "refused", reason: "cooldown" });
    const modest = askRaise(repo, data, P, "2028-07-01" as never, { monthlyWage: Math.round(referenceWage(club, P) * 1.05), years: 3 });
    if (modest.result === "accepted") expect(contractOf(repo)?.monthlyWage).toBe(modest.terms.monthlyWage);
  });
});
