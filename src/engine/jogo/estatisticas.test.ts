import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { matchReport } from "./estatisticas";
import { matchRecord } from "./registo";
import { simulateMatch } from "./simulador";
import { syntheticTeam } from "./teste-util";
import type { MatchInput, MatchEvent } from "./tipos";

const input = (id: string, a = 10, b = 10): MatchInput => ({ seed: "s", id, home: syntheticTeam("A", a), away: syntheticTeam("B", b) });
function report(e: MatchInput) {
  const { events, summary } = simulateMatch(e, P);
  return { events, summary, r: matchReport(e, { home: e.home, away: e.away }, events, summary, P) };
}

describe("estatísticas pós-jogo", () => {
  it("é consistente com o resumo e com os eventos", () => {
    for (let i = 0; i < 80; i++) {
      const { events, summary, r } = report(input(`e${i}`));
      expect(r.homeGoals).toBe(summary.home.goals);
      expect(r.awayGoals).toBe(summary.away.goals);
      expect(r.goals).toHaveLength(r.homeGoals + r.awayGoals);
      const sum = (pitch: "goals" | "shots" | "onTarget" | "fouls", side: "home" | "away") => r.players.filter((j) => j.side === side).reduce((s, j) => s + j[pitch], 0);
      for (const side of ["home", "away"] as const) {
        expect(sum("goals", side)).toBe(summary[side].goals);
        expect(sum("shots", side)).toBe(summary[side].shots);
        expect(sum("onTarget", side)).toBe(summary[side].onTarget);
        expect(sum("fouls", side)).toBe(summary[side].fouls);
      }
      const assist = events.filter((e): e is Extract<MatchEvent, { type: "shot" }> => e.type === "shot" && e.outcome === "goal" && !!e.assistant).length;
      expect(r.players.reduce((s, j) => s + j.assists, 0)).toBe(assist);
      // marcador corrente, ordem e intervalo
      let last = 0;
      for (const g of r.goals) {
        expect(g.minute).toBeGreaterThanOrEqual(last);
        last = g.minute;
      }
      expect(r.goals.at(-1) ? [r.goals.at(-1)?.homeGoals, r.goals.at(-1)?.awayGoals] : [0, 0]).toEqual([r.homeGoals, r.awayGoals]);
      expect(r.halfTime.home).toBeLessThanOrEqual(r.homeGoals);
      expect(r.halfTime.away).toBeLessThanOrEqual(r.awayGoals);
      expect(r.moments.filter((m) => m.type === "goal")).toHaveLength(r.goals.length);
    }
  });

  it("é determinístico", () => {
    expect(report(input("d1")).r).toEqual(report(input("d1")).r);
  });

  it("as notas ficam entre os limites e o homem do jogo tem a melhor", () => {
    for (let i = 0; i < 60; i++) {
      const { r } = report(input(`n${i}`));
      for (const j of r.players) {
        expect(j.rating).toBeGreaterThanOrEqual(P.match.ratings.min);
        expect(j.rating).toBeLessThanOrEqual(P.match.ratings.max);
      }
      const best = Math.max(...r.players.map((j) => j.rating));
      expect(r.players.find((j) => j.id === r.matchMan)?.rating).toBe(best);
    }
  });

  it("quem marca e a baliza a zero sobem a nota; sofrer golos desce-a", () => {
    let scorers = 0, nonScorers = 0, markN = 0, notN = 0, zeroGk = 0, nZero = 0, suffersGk = 0, suffersN = 0, winners = 0, nV = 0, beaten = 0, winN = 0;
    for (let i = 0; i < 400; i++) {
      const { r } = report(input(`m${i}`));
      for (const j of r.players) {
        if (j.position !== "GK" && j.position !== "CB") {
          if (j.goals > 0) { scorers += j.rating; markN++; } else { nonScorers += j.rating; notN++; }
        }
        if (j.position === "GK") {
          if (j.concededGoals === 0) { zeroGk += j.rating; nZero++; } else { suffersGk += j.rating; suffersN++; }
        }
        const mine = j.side === "home" ? r.homeGoals : r.awayGoals;
        const its = j.side === "home" ? r.awayGoals : r.homeGoals;
        if (mine > its) { winners += j.rating; nV++; } else if (mine < its) { beaten += j.rating; winN++; }
      }
    }
    expect(scorers / markN).toBeGreaterThan(nonScorers / notN + 0.7);
    expect(zeroGk / nZero).toBeGreaterThan(suffersGk / suffersN + 0.5);
    expect(winners / nV).toBeGreaterThan(beaten / winN + 0.4);
  });

  it("a nota média de um jogador anda perto do 6", () => {
    let sum = 0, n = 0;
    for (let i = 0; i < 200; i++) for (const j of report(input(`b${i}`)).r.players) { sum += j.rating; n++; }
    expect(sum / n).toBeGreaterThan(5.8);
    expect(sum / n).toBeLessThan(6.5);
  });

  it("os momentos-chave descrevem o que o marcador fez", () => {
    const contexts = new Set<string>();
    let missedPenalties = 0, saves = 0, chances = 0;
    for (let i = 0; i < 300; i++) {
      const { r } = report(input(`k${i}`));
      const minutes = r.moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      for (const m of r.moments) {
        if (m.type === "goal") contexts.add(m.context);
        else if (m.type === "penalti-falhado") missedPenalties++;
        else if (m.type === "grande-defesa") { saves++; expect(m.xg).toBeGreaterThanOrEqual(P.match.moments.bigXg); }
        else if (m.type === "expulsao" || m.type === "injury") continue;
        else { chances++; expect(m.xg).toBeGreaterThanOrEqual(P.match.moments.bigXg); }
      }
      // o primeiro golo do jogo é sempre abertura
      const first = r.moments.find((m) => m.type === "goal");
      if (first?.type === "goal") expect(first.context).toBe("abertura");
    }
    for (const c of ["abertura", "draw", "vantagem", "turnaround", "alargou"]) expect(contexts.has(c), c).toBe(true);
    expect(missedPenalties).toBeGreaterThan(0);
    expect(saves).toBeGreaterThan(0);
    expect(chances).toBeGreaterThan(0);
  });

  it("os momentos coincidem com um jogo escrito à mão: 0-0, 1-0, 1-1, 2-1", () => {
    const e = input("mao");
    const [a0, a1] = [e.home.lineup[10]!.id, e.home.lineup[9]!.id];
    const b0 = e.away.lineup[10]!.id;
    const events: MatchEvent[] = [
      { type: "shot", minute: 10, side: "home", player: a0, assistant: a1, xg: 0.2, outcome: "goal", origin: "jogada" },
      { type: "shot", minute: 30, side: "away", player: b0, xg: 0.1, outcome: "goal", origin: "jogada" },
      { type: "shot", minute: 60, side: "home", player: a0, xg: 0.76, outcome: "goal", origin: "penalty" },
      { type: "shot", minute: 70, side: "away", player: b0, xg: 0.76, outcome: "saved", origin: "penalty", goalkeeper: e.home.lineup[0]!.id },
    ];
    const summary = { ...simulateMatch(e, P).summary };
    const r = matchReport(e, { home: e.home, away: e.away }, events, summary, P);
    expect(r.goals.map((g) => [g.homeGoals, g.awayGoals])).toEqual([[1, 0], [1, 1], [2, 1]]);
    expect(r.moments.map((m) => (m.type === "goal" ? m.context : m.type))).toEqual(["abertura", "draw", "vantagem", "penalti-falhado"]);
    expect(r.halfTime).toEqual({ home: 1, away: 1 });
    expect(r.players.find((j) => j.id === a0)).toMatchObject({ goals: 2, shots: 2, onTarget: 2 });
    expect(r.players.find((j) => j.id === a1)?.assists).toBe(1);
    expect(r.players.find((j) => j.id === b0)).toMatchObject({ missedPenalties: 1 });
    expect(r.players.find((j) => j.id === e.home.lineup[0]!.id)?.saves).toBe(1);
    expect(r.matchMan).toBe(a0);
  });

  it("um jogador desconhecido é um erro", () => {
    const e = input("x");
    const summary = simulateMatch(e, P).summary;
    const ev: MatchEvent[] = [{ type: "foul", minute: 5, side: "home", player: "ninguem", penalty: false }];
    expect(() => matchReport(e, { home: e.home, away: e.away }, ev, summary, P)).toThrow(/ninguem/);
  });

  it("as notas vão para as participações", () => {
    const e = input("p1");
    const { events, summary, r } = report(e);
    const { appearances } = matchRecord({ id: "p1", competition: "x", season: 2026, round: 1, date: "2026-09-01" as never }, e.home, e.away, events, summary, r);
    expect(appearances).toHaveLength(22);
    for (const p of appearances) expect(p.rating).toBe(r.players.find((j) => j.id === p.player)?.rating);
  });
});
