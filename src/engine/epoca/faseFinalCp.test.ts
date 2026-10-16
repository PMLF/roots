import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { weekDay } from "../calendario/datas";
import { finalPhaseDates, finalSemiPair, sortChampions, knockoutRoundWinner, type SeriesChampion } from "./faseFinalCp";

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
  it("sem empate passa quem marcou mais; com empate decidem os penáltis, sempre os mesmos e com um vencedor", () => {
    expect(knockoutRoundWinner({ seed: "s", id: "j", home: "x", away: "y", homeGoals: 2, awayGoals: 1 }, P)).toEqual({ winner: "x" });
    expect(knockoutRoundWinner({ seed: "s", id: "j", home: "x", away: "y", homeGoals: 0, awayGoals: 1 }, P)).toEqual({ winner: "y" });
    const a = knockoutRoundWinner({ seed: "s", id: "j", home: "x", away: "y", homeGoals: 1, awayGoals: 1 }, P);
    expect(knockoutRoundWinner({ seed: "s", id: "j", home: "x", away: "y", homeGoals: 1, awayGoals: 1 }, P)).toEqual(a);
    expect(a.penalties).toBeDefined();
    expect(a.penalties!.home).not.toBe(a.penalties!.away);
    expect(a.winner).toBe(a.penalties!.home > a.penalties!.away ? "x" : "y");
  });
  it("os penáltis dão vitórias aos dois lados, perto de metade-metade", () => {
    let home = 0;
    for (let i = 0; i < 2000; i++) if (knockoutRoundWinner({ seed: "s", id: `j${i}`, home: "x", away: "y", homeGoals: 0, awayGoals: 0 }, P).winner === "x") home++;
    expect(home / 2000).toBeGreaterThan(0.45);
    expect(home / 2000).toBeLessThan(0.55);
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
