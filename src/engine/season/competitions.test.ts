import { describe, expect, it } from "vitest";
import { weekDay } from "../calendar/dates";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { cupDates, cupKind, districtCupName, leaguesEnd, CUP, SUPERCUP } from "./competitions";

describe("taças: datas", () => {
  it("espalha as rondas em quartas-feiras livres e acaba na final", () => {
    const blocked = (d: string) => d === "2026-10-14";
    const d = cupDates(6, "2026-09-01", "2027-05-30", [3, 2, 4], blocked);
    expect(d).toHaveLength(6);
    expect(d.at(-1)).toBe("2027-05-30");
    expect(d.slice(0, 5).every((x) => weekDay(x) === 3 && !blocked(x))).toBe(true);
    expect([...d].sort()).toEqual(d);
    expect(new Set(d).size).toBe(6);
  });
  it("junta outros dias da semana só se faltarem quartas-feiras", () => {
    const onlyOneWednesday = (d: string) => weekDay(d) === 3 && d !== "2026-09-02";
    const d = cupDates(3, "2026-09-01", "2026-09-20", [3, 2], onlyOneWednesday);
    expect(d).toHaveLength(3);
    expect(d.at(-1)).toBe("2026-09-20");
    expect(() => cupDates(30, "2026-09-01", "2026-09-20", [3], () => false)).toThrow();
  });
  it("uma só data é a da final", () => {
    expect(cupDates(1, "2026-09-01", "2027-05-30", [3], () => false)).toEqual(["2027-05-30"]);
  });
  it("as ligas acabam antes da final da Taça (domingo, depois do fim de tudo)", () => {
    const end = leaguesEnd(1, P);
    expect(end >= "2027-05-18").toBe(true);
    expect(end <= "2027-06-10").toBe(true);
  });
  it("reconhece as taças pelo nome", () => {
    expect(cupKind(CUP)).toBe("cup");
    expect(cupKind(SUPERCUP)).toBe("supercup");
    expect(cupKind(districtCupName("Braga"))).toBe("districtCup");
    expect(cupKind("Primeira Liga")).toBeUndefined();
  });
});
