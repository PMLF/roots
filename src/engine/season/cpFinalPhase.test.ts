import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { weekDay } from "../calendar/dates";
import { finalPhaseDates, finalSemiPair, sortChampions, type SeriesChampion } from "./cpFinalPhase";

const c = (club: string, series: SeriesChampion["series"], points: number, extra: Partial<SeriesChampion> = {}): SeriesChampion => ({ series, club, matches: 18, points, difference: 20, scoredGoals: 40, reputation: 100, ...extra });

describe("fase final do CP", () => {
  it("meias-finais: o melhor contra o pior e o segundo contra o terceiro, com o melhor em casa", () => {
    const r = finalSemiPair([c("b", "B", 45), c("a", "A", 50), c("d", "D", 38), c("cc", "C", 41)]);
    expect(r).toEqual([{ home: "a", away: "d" }, { home: "b", away: "cc" }]);
  });
  it("desempata por pontos por jogo, diferença, golos, menor reputação e id", () => {
    expect(sortChampions([c("a", "A", 40, { matches: 20 }), c("b", "B", 40, { matches: 18 })])[0]!.club).toBe("b");
    expect(sortChampions([c("a", "A", 40, { difference: 10 }), c("b", "B", 40, { difference: 15 })])[0]!.club).toBe("b");
    expect(sortChampions([c("a", "A", 40, { scoredGoals: 30 }), c("b", "B", 40, { scoredGoals: 35 })])[0]!.club).toBe("b");
    expect(sortChampions([c("a", "A", 40, { reputation: 300 }), c("b", "B", 40, { reputation: 90 })])[0]!.club).toBe("b");
    expect(sortChampions([c("b", "B", 40), c("a", "A", 40)])[0]!.club).toBe("a");
  });
  it("precisa dos quatro campeões", () => {
    expect(() => finalSemiPair([c("a", "A", 40)])).toThrow();
  });
  it("as datas são domingos, depois das séries, e a final vem a seguir às meias-finais", () => {
    const d = finalPhaseDates("2027-04-25", P);
    expect(weekDay(d.finalSemi)).toBe(0);
    expect(weekDay(d.final)).toBe(0);
    expect(d.finalSemi > "2027-04-25").toBe(true);
    expect(d.final > d.finalSemi).toBe(true);
    expect(d.final <= "2027-05-31").toBe(true);
  });
});
