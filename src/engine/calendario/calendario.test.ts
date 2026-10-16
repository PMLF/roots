import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { DEFAULT_PARAMETERS as PARAMETERS } from "../config/parametros";
import { weekDay } from "./datas";
import { generateLeagueCalendar, validateCalendar } from "./calendario";
import { largerAwayHomeSequence, allAgainstAll } from "./todosContraTodos";

const clubs = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const C = PARAMETERS.calendar;

describe("todos contra todos", () => {
  it.each([4, 6, 8, 10, 12, 16, 18, 20])("n=%i: sem sequências de 3 casa/fora", (n) => {
    const r = allAgainstAll(clubs(n), 2, new Rng("7"));
    expect(r.length).toBe(2 * (n - 1));
    for (const m of largerAwayHomeSequence(r).values()) expect(m).toBeLessThanOrEqual(2);
  });
  it("n ímpar tem folga por ronda", () => {
    const r = allAgainstAll(clubs(7), 2, new Rng("1"));
    expect(r.length).toBe(14);
    expect(r.every((x) => x.bye !== undefined)).toBe(true);
  });
  it("é determinístico", () => {
    expect(allAgainstAll(clubs(10), 2, new Rng("3"))).toEqual(allAgainstAll(clubs(10), 2, new Rng("3")));
  });
});

describe("calendário de liga", () => {
  it.each([
    ["firstLeague", 18],
    ["secondLeague", 16],
    ["thirdLeague", 20],
    ["district", 14],
    ["district", 11],
  ] as const)("%s com %i clubes é válido e respeita as janelas", (tier, n) => {
    const cal = generateLeagueCalendar({ competition: `${tier}-${n}`, tier, clubs: clubs(n) }, 1, C, new Rng("42"));
    expect(validateCalendar(cal)).toEqual([]);
    const first = cal.rounds[0]!.date;
    const last = cal.rounds[cal.rounds.length - 1]!.date;
    expect(first >= "2026-08-15").toBe(true);
    expect(last <= "2027-05-18").toBe(true);
    for (const j of cal.rounds)
      for (const g of j.matches) expect(C.matchDays[tier].includes(weekDay(g.date)) || weekDay(g.date) === 3).toBe(true);
  });
  it("não joga nas pausas", () => {
    const cal = generateLeagueCalendar({ competition: "pl", tier: "firstLeague", clubs: clubs(18) }, 1, C, new Rng("5"));
    for (const j of cal.rounds) {
      expect(j.date >= "2026-12-22" && j.date <= "2027-01-02").toBe(false);
      expect(j.date >= "2026-10-09" && j.date <= "2026-10-15").toBe(false);
    }
  });
  it("determinístico por seed", () => {
    const d = { competition: "x", tier: "secondLeague" as const, clubs: clubs(16) };
    expect(generateLeagueCalendar(d, 2, C, new Rng("9"))).toEqual(generateLeagueCalendar(d, 2, C, new Rng("9")));
  });
});

describe("calendário no repositório", () => {
  it("guarda um calendário gerado e devolve-o igual", async () => {
    const { MemoryRepository } = await import("../persistencia/repositorioMemoria");
    const { forRepository } = await import("./calendario");
    const cal = generateLeagueCalendar({ competition: "SL", tier: "secondLeague", clubs: clubs(15) }, 1, C, new Rng("1"));
    const r = new MemoryRepository();
    const { matches, byes } = forRepository(cal);
    r.saveCalendar(matches, byes);
    expect(r.calendar("SL", 1).matches).toHaveLength(15 * 14);
    expect(r.calendar("SL", 1).byes).toHaveLength(30);
    expect(r.clubCalendar("c1", 1)).toHaveLength(28);
  });
});
