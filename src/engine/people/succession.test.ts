import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { ageAt } from "../calendar/dates";
import { data, fresh } from "../squad/testWorld.testlib";
import { staffRetirementProbability, staffSuccession } from "./succession";

describe("reforma do staff", () => {
  it("a probabilidade sobe com a idade e é 1 na idade máxima", () => {
    expect(staffRetirementProbability("coach", 50, P)).toBe(0);
    expect(staffRetirementProbability("coach", 63, P)).toBeGreaterThan(staffRetirementProbability("coach", 60, P));
    expect(staffRetirementProbability("coach", P.squadCycle.staffRetirement.byFn.coach!.maxAge, P)).toBe(1);
    expect(staffRetirementProbability("mayor", 90, P)).toBe(0);
  });
  it("quem passa da idade máxima sai e é substituído no mesmo lugar", () => {
    const repo = fresh("reforma-staff");
    const today = "2060-07-01" as const;
    const before = repo.roleHolders("president").length;
    const n = staffSuccession(repo, data, P, 30, today);
    expect(n).toBeGreaterThan(0);
    expect(repo.roleHolders("president").length).toBe(before);
    for (const fn of ["president", "coach", "scout", "agent"]) for (const id of repo.roleHolders(fn)) expect(ageAt(repo.person(id)!.birth, today)).toBeLessThan(P.squadCycle.staffRetirement.byFn[fn]!.maxAge);
    // um treinador novo entra livre
    expect(repo.roleHolders("coach").length).toBeGreaterThanOrEqual(data.clubs.length - 0 > 0 ? 1 : 0);
  });
});
