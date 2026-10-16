import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { simulateMatch } from "./simulador";
import { syntheticTeam } from "./teste-util";
import type { MatchSummary } from "./tipos";

function campaign(homeN: number, awayN: number, n: number) {
  const home = syntheticTeam("C", homeN);
  const away = syntheticTeam("F", awayN);
  let v = 0, e = 0, d = 0;
  const sum = { goals: 0, awayGoals: 0, shots: 0, onTarget: 0, xg: 0, awayXg: 0, corners: 0, fouls: 0, possession: 0, penalties: 0, chance: 0 };
  for (let i = 0; i < n; i++) {
    const { events, summary: r } = simulateMatch({ seed: "cal", id: `j${i}`, home, away }, P) as { events: { type: string; origin?: string }[]; summary: MatchSummary };
    if (r.home.goals > r.away.goals) v++; else if (r.home.goals === r.away.goals) e++; else d++;
    sum.goals += r.home.goals; sum.awayGoals += r.away.goals;
    sum.shots += r.home.shots + r.away.shots;
    sum.onTarget += r.home.onTarget + r.away.onTarget;
    sum.xg += r.home.xg; sum.awayXg += r.away.xg;
    sum.corners += r.home.corners + r.away.corners;
    sum.fouls += r.home.fouls + r.away.fouls;
    sum.chance += r.home.chances + r.away.chances;
    sum.possession += r.homePossession;
    sum.penalties += events.filter((x) => x.type === "shot" && x.origin === "penalty").length;
  }
  return {
    homeWin: v / n, draw: e / n, awayWin: d / n,
    matchGoals: (sum.goals + sum.awayGoals) / n, homeGoals: sum.goals / n, awayGoals: sum.awayGoals / n,
    teamShots: sum.shots / n / 2, teamOnTarget: sum.onTarget / n / 2, teamChances: sum.chance / n / 2,
    matchXg: (sum.xg + sum.awayXg) / n, matchCorners: sum.corners / n, matchFouls: sum.fouls / n, homePossession: sum.possession / n, matchPenalties: sum.penalties / n,
  };
}

describe("calibração do motor de jogo (RZ-104; o harness completo é RZ-123)", () => {
  it("equipas iguais: números de um jogo normal de futebol", () => {
    const c = campaign(10, 10, 4000);
    console.log("equal", JSON.stringify(c, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    expect(c.matchGoals).toBeGreaterThan(2.3);
    expect(c.matchGoals).toBeLessThan(3.0);
    expect(c.teamChances).toBeGreaterThan(21);
    expect(c.teamChances).toBeLessThan(27);
    expect(c.teamShots).toBeGreaterThan(10);
    expect(c.teamShots).toBeLessThan(15);
    expect(c.teamOnTarget).toBeGreaterThan(3.5);
    expect(c.teamOnTarget).toBeLessThan(6);
    expect(c.matchCorners).toBeGreaterThan(8);
    expect(c.matchCorners).toBeLessThan(13);
    expect(c.matchFouls).toBeGreaterThan(21);
    expect(c.matchFouls).toBeLessThan(27);
    expect(c.matchPenalties).toBeGreaterThan(0.15);
    expect(c.matchPenalties).toBeLessThan(0.45);
    expect(c.homeWin).toBeGreaterThan(0.4);
    expect(c.homeWin).toBeLessThan(0.5);
    expect(c.draw).toBeGreaterThan(0.22);
    expect(c.draw).toBeLessThan(0.32);
    expect(c.homePossession).toBeGreaterThan(0.5);
    expect(c.homePossession).toBeLessThan(0.58);
    // xG: os golos esperados batem com os marcados (com equipas médias, o xG é o modelo certo)
    expect(Math.abs(c.matchXg - c.matchGoals) / c.matchGoals).toBeLessThan(0.08);
  });

  it("a força conta: mais qualidade, mais pontos, mas o azar existe", () => {
    const two = campaign(12, 10, 3000);
    console.log("12-10", JSON.stringify(two, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    const strong = campaign(12, 9, 3000);
    console.log("forte-casa", JSON.stringify(strong, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    expect(strong.homeWin).toBeGreaterThan(0.62);
    expect(strong.homeWin).toBeLessThan(0.85);
    expect(strong.awayWin).toBeGreaterThan(0.04);
    expect(strong.homePossession).toBeGreaterThan(0.6);
    const awayStrong = campaign(9, 12, 3000);
    expect(awayStrong.awayWin).toBeGreaterThan(0.5);
    expect(awayStrong.homeWin).toBeGreaterThan(0.1);
    const much = campaign(14, 8, 2000);
    expect(much.homeWin).toBeGreaterThan(0.85);
    expect(much.awayWin).toBeGreaterThan(0.005);
  });
});
