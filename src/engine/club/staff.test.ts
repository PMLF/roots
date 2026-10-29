import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { Tier } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { dismissStaff, hireStaff, seedStaffMarket, staffCandidates, staffSeasonEnd } from "./staff";

const holders = (repo: ReturnType<typeof fresh>, fn: string, club: string) => repo.roleHolders(fn).filter((id) => repo.role(id)?.club === club);
const sameTiers = new Map<string, Tier>(data.clubs.map((c) => [c.id, c.tier]));

describe("staff técnico (RZ-208)", () => {
  it("o gamer despede e contrata; só com lugar livre; o livre sai do mercado", () => {
    const repo = fresh("staff-gamer");
    const club = data.clubs.find((c) => c.tier === "firstLeague")!.id;
    seedStaffMarket(repo, data, P, "2026-07-01");
    const medic = holders(repo, "medical", club)[0]!;
    const cand = staffCandidates(repo, P, "medical", club, "2026-07-01");
    expect(cand.length).toBeGreaterThan(0);
    expect(cand.every((c) => c.estimate >= 1 && c.estimate <= 20)).toBe(true);
    expect(hireStaff(repo, P, club, cand[0]!.id, "2026-07-01", 1)).toEqual({ ok: false, reason: "slotTaken" });
    expect(dismissStaff(repo, P, club, medic, "2026-07-01", 1)).toEqual({ ok: true });
    expect(dismissStaff(repo, P, club, medic, "2026-07-01", 1)).toEqual({ ok: false, reason: "notYours" });
    expect(hireStaff(repo, P, club, cand[0]!.id, "2026-07-01", 1)).toEqual({ ok: true });
    expect(holders(repo, "medical", club)).toEqual([cand[0]!.id]);
    expect(staffCandidates(repo, P, "medical", club, "2026-07-01").some((c) => c.id === cand[0]!.id)).toBe(false);
  }, 60000);
  it("no fim da época há carreiras, ninguém fica em dois clubes e os lugares ficam preenchidos", () => {
    const repo = fresh("staff-carreiras");
    const p = { ...P, staff: { ...P.staff, career: { ...P.staff.career, attempt: 1, accept: 1, qualityEdge: -20 } } };
    const before = new Map(p.staff.functions.flatMap((fn) => repo.roleHolders(fn).map((id) => [id, repo.role(id)!.club] as const)));
    staffSeasonEnd(repo, data, p, 1, "2027-06-30", sameTiers);
    let moved = 0;
    for (const [id, club] of before) if (repo.role(id)?.club !== club) moved++;
    expect(moved).toBeGreaterThan(5);
    for (const fn of ["assistant", "medical", "physio", "community"]) {
      const at = repo.roleHolders(fn).map((id) => repo.role(id)?.club).filter((c): c is string => !!c);
      expect(new Set(at).size).toBe(at.length);
    }
    // cada clube continua com assistente e médico
    for (const c of data.clubs.filter((c) => holders(repo, "medical", c.id).length === 0 && before.size > 0 && [...before.values()].includes(c.id))) {
      expect(holders(repo, "medical", c.id).length).toBe(1);
    }
  }, 60000);
});
