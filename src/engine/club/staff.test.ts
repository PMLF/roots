import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { Tier } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { riskPer90 } from "../injuries/injury";
import { clubBalance, monthlyStaffCost } from "./finances";
import { dismissStaff, hireStaff, ownStaff, seedStaffMarket, staffCandidates, staffSeasonEnd, staffWage } from "./staff";

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
    expect(dismissStaff(repo, data, P, club, medic, "2026-07-01", 1)).toEqual({ ok: true });
    expect(dismissStaff(repo, data, P, club, medic, "2026-07-01", 1)).toEqual({ ok: false, reason: "notYours" });
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
  it("um clube melhor pode aliciar staff do clube do gamer, que fica com o lugar vago e uma notícia", () => {
    const repo = fresh("staff-aliciar");
    const p = { ...P, staff: { ...P.staff, career: { ...P.staff.career, attempt: 1, accept: 1, qualityEdge: -20 } } };
    const mine = data.clubs.find((c) => c.tier === "cp" && holders(repo, "medical", c.id).length > 0)!.id;
    const staff = p.staff.functions.flatMap((fn) => holders(repo, fn, mine));
    staffSeasonEnd(repo, data, p, 1, "2027-06-30", sameTiers, mine);
    const gone = staff.filter((id) => repo.role(id)?.club !== mine);
    expect(gone.length).toBeGreaterThan(0);
    const moves = repo.recentEvents({ types: ["STAFF_MOVED"] }).filter((e) => e.entities.some((x) => x.roleKind === "from" && x.id === mine));
    expect(moves.length).toBe(gone.length);
    // o lugar vago do gamer não é preenchido por conta própria
    expect(p.staff.functions.some((fn) => fn !== "scout" && holders(repo, fn, mine).length === 0)).toBe(true);
  }, 60000);
  it("o ordenado sobe com a qualidade e o custo do staff soma os ordenados do clube", () => {
    const repo = fresh("staff-ordenados");
    const base = data.clubs.find((c) => c.tier === "firstLeague")!;
    expect(staffWage(P, "firstLeague", 16)).toBeGreaterThan(staffWage(P, "firstLeague", 6));
    expect(staffWage(P, "firstLeague", 10)).toBeGreaterThan(staffWage(P, "secondLeague", 10));
    const before = monthlyStaffCost(repo, base, P);
    const mine = ownStaff(repo, data, P, base.id, "2026-07-01");
    expect(mine.length).toBeGreaterThan(0);
    const admin = P.finances.model.monthlyStaff.firstLeague * (1 - P.staff.wages.share);
    expect(before).toBeCloseTo(admin + mine.reduce((t, x) => t + x.wage, 0), -1);
    expect(mine.every((x) => x.quality >= 1 && x.severance === x.wage * P.staff.wages.severanceMonths)).toBe(true);
  }, 60000);
  it("despedir staff paga meses de ordenado ao clube", () => {
    const repo = fresh("staff-indemnizacao");
    const base = data.clubs.find((c) => c.tier === "firstLeague")!;
    const target = ownStaff(repo, data, P, base.id, "2026-07-01")[0]!;
    const cash = clubBalance(repo, base);
    expect(dismissStaff(repo, data, P, base.id, target.id, "2026-07-01", 1)).toEqual({ ok: true });
    expect(clubBalance(repo, base)).toBe(cash - target.severance);
  }, 60000);
  it("um médico prudente corre menos riscos; olheiros melhores dão estimativas mais certas", () => {
    expect(riskPer90({ form: 1, physicalAptitude: 10, caution: 1 }, P)).toBeLessThan(riskPer90({ form: 1, physicalAptitude: 10, caution: -1 }, P));
    const repo = fresh("staff-estimativas");
    seedStaffMarket(repo, data, P, "2026-07-01");
    const club = data.clubs.find((c) => c.tier === "firstLeague")!.id;
    for (const id of holders(repo, "scout", club)) repo.setRoleQuality(id, { scouting: 20 });
    const sharp = staffCandidates(repo, P, "medical", club, "2026-07-01");
    for (const id of holders(repo, "scout", club)) repo.setRoleQuality(id, { scouting: 1 });
    const blunt = staffCandidates(repo, P, "medical", club, "2026-07-01");
    const real = (id: string) => (repo.role(id)?.quality?.medicine ?? 10);
    const dev = (l: typeof sharp) => l.reduce((t, c) => t + Math.abs(c.estimate - real(c.id)), 0) / l.length;
    expect(dev(sharp)).toBeLessThan(dev(blunt));
  }, 60000);
});
