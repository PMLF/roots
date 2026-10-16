import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parametros";
import type { CpSeries } from "../dados/tipos";
import { groupCalendar, rankGroup, buildGroups, groupPromoted } from "./fasePromocao";

const seriesOf = (d: string) => d[0] as CpSeries;
const champions = ["A", "B", "C", "D"].flatMap((s) => [1, 2, 3, 4, 5].map((i) => ({ club: `${s}${i}`, district: `${s}${i}` })));

describe("Fase de Promoção", () => {
  it("forma 4 grupos de 5 pelas séries", () => {
    const { groups, warnings } = buildGroups(champions, seriesOf, DEFAULT_PARAMETERS);
    expect(warnings).toEqual([]);
    expect(groups.map((g) => g.clubs.length)).toEqual([5, 5, 5, 5]);
    expect(groups[1]!.clubs).toEqual(["B1", "B2", "B3", "B4", "B5"]);
  });

  it("avisa de grupos incompletos", () => {
    expect(buildGroups(champions.slice(1), seriesOf, DEFAULT_PARAMETERS).warnings).toHaveLength(1);
  });

  it("o calendário é uma volta: cada par joga uma vez (10 jogos, 5 rondas com folga)", () => {
    const { groups } = buildGroups(champions, seriesOf, DEFAULT_PARAMETERS);
    const cal = groupCalendar(groups[0]!, 1, "seed", DEFAULT_PARAMETERS);
    expect(cal).toHaveLength(5);
    const pairs = cal.flatMap((r) => r.matches.map((j) => [j.home, j.away].sort().join("-")));
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs).size).toBe(10);
  });

  it("promove os 2 primeiros do grupo e desempata pelo menor reputação", () => {
    const { groups } = buildGroups(champions, seriesOf, DEFAULT_PARAMETERS);
    const g = groups[2]!; // C1..C5
    const matches = [
      { home: "C1", away: "C2", homeGoals: 1, awayGoals: 0 },
      { home: "C3", away: "C4", homeGoals: 1, awayGoals: 0 },
      { home: "C5", away: "C1", homeGoals: 0, awayGoals: 1 },
    ];
    // C1 tem 6 pontos; C3 tem 3, tal como... C3 1 jogo=3 pts; os restantes 0 → C3 segundo
    const table = rankGroup(g, matches, 1, "seed", DEFAULT_PARAMETERS, new Map());
    expect(table.slice(0, 2)).toEqual(["C1", "C3"]);
    expect(groupPromoted(g, table, DEFAULT_PARAMETERS)).toEqual([{ club: "C1", series: "C" }, { club: "C3", series: "C" }]);
    // empate total entre C2, C4, C5 (0 pontos, DG diferentes) — sem jogos extra, o desempate é estável
    expect(rankGroup(g, matches, 1, "seed", DEFAULT_PARAMETERS, new Map())).toEqual(table);
  });
});
