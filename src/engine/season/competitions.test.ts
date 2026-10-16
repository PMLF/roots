import { describe, expect, it } from "vitest";
import { weekDay } from "../calendar/dates";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { finalPhaseDates } from "./cpFinalPhase";
import { cupKind, districtCupName, districtSupercupName, leaguesEnd, promotionDates, CUP, SUPERCUP } from "./competitions";

describe("taças: datas", () => {
  it("a Fase de Promoção salta os fins de semana de taça", () => {
    const free = promotionDates(5, 1, P, new Set());
    const blocked = new Set([free[1]!.replace(/\d\d$/, (d) => String(Number(d) + 1).padStart(2, "0"))]);
    const skipped = promotionDates(5, 1, P, blocked);
    expect(free.every((d) => weekDay(d) === 6)).toBe(true);
    expect(skipped).toHaveLength(5);
    expect(skipped).not.toContain(free[1]);
    expect(skipped.at(-1)! > free.at(-1)!).toBe(true);
  });
  it("a fase final do CP salta os domingos de taça", () => {
    const base = finalPhaseDates("2027-04-25", P);
    const moved = finalPhaseDates("2027-04-25", P, new Set([base.finalSemi]));
    expect(moved.finalSemi > base.finalSemi).toBe(true);
    expect(weekDay(moved.finalSemi)).toBe(0);
    expect(moved.final > moved.finalSemi).toBe(true);
  });
  it("as ligas acabam em maio e a taça só depois", () => {
    const end = leaguesEnd(1, P, new Set());
    expect(end >= "2027-05-18").toBe(true);
    expect(end <= "2027-06-10").toBe(true);
  });
  it("reconhece as taças pelo nome", () => {
    expect(cupKind(CUP)).toBe("cup");
    expect(cupKind(SUPERCUP)).toBe("supercup");
    expect(cupKind(districtCupName("Braga"))).toBe("districtCup");
    expect(cupKind(districtSupercupName("Braga"))).toBe("districtSupercup");
    expect(cupKind("Primeira Liga")).toBeUndefined();
  });
});
