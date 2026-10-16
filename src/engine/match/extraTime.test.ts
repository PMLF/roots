import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { syntheticTeam } from "./test-util";
import { MatchSimulator, simulateMatch } from "./simulator";
import type { MatchInput } from "./types";

const input = (id: string, extra: Partial<MatchInput> = {}, a = 10, b = 10): MatchInput => ({ seed: "et", id, home: syntheticTeam("A", a), away: syntheticTeam("B", b), ...extra });

describe("jogos a eliminar: prolongamento e penáltis (RZ-140)", () => {
  it("um jogo normal nunca tem prolongamento nem penáltis, mesmo empatado", () => {
    for (let i = 0; i < 80; i++) {
      const { summary } = simulateMatch(input(`n${i}`), P);
      expect(summary.extraTime).toBe(false);
      expect(summary.shootout).toBeUndefined();
      expect(summary.duration).toBe(summary.regularDuration);
    }
  });

  it("sem empate no fim dos 90' o jogo a eliminar é igual ao normal", () => {
    let compared = 0;
    for (let i = 0; i < 80; i++) {
      const normal = simulateMatch(input(`k${i}`), P);
      if (normal.summary.home.goals === normal.summary.away.goals) continue;
      const knock = simulateMatch(input(`k${i}`, { knockout: true }), P);
      expect(knock.events).toEqual(normal.events);
      expect(knock.summary).toEqual(normal.summary);
      compared++;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it("empatado ao fim dos 90' joga mais 30' (e acréscimos); se continua empatado, decidem os penáltis", () => {
    let extra = 0;
    let penalties = 0;
    let decidedInExtra = 0;
    for (let i = 0; i < 400; i++) {
      const normal = simulateMatch(input(`e${i}`), P);
      const knock = simulateMatch(input(`e${i}`, { knockout: true }), P);
      const level = normal.summary.home.goals === normal.summary.away.goals;
      expect(knock.summary.extraTime).toBe(level);
      if (!level) continue;
      extra++;
      const s = knock.summary;
      const x = P.match.extraTime;
      expect(s.duration).toBeGreaterThanOrEqual(s.regularDuration + x.minutes + x.stoppage.min);
      expect(s.duration).toBeLessThanOrEqual(s.regularDuration + x.minutes + x.stoppage.max);
      // os 90' são os mesmos; o resto vem depois
      expect(knock.events.filter((e) => e.minute <= s.regularDuration)).toEqual(normal.events);
      if (s.home.goals === s.away.goals) {
        penalties++;
        expect(s.shootout).toBeDefined();
        const sh = s.shootout!;
        expect(sh.home).not.toBe(sh.away);
        expect(sh.kicks.filter((k) => k.side === "home" && k.scored)).toHaveLength(sh.home);
        expect(sh.kicks.filter((k) => k.side === "away" && k.scored)).toHaveLength(sh.away);
      } else {
        decidedInExtra++;
        expect(s.shootout).toBeUndefined();
      }
    }
    expect(extra).toBeGreaterThan(40);
    expect(penalties).toBeGreaterThan(5);
    expect(decidedInExtra).toBeGreaterThan(5);
  });

  it("é retomável também com prolongamento", () => {
    let found = 0;
    for (let i = 0; i < 200 && found < 4; i++) {
      const whole = simulateMatch(input(`p${i}`, { knockout: true }), P);
      if (!whole.summary.extraTime) continue;
      found++;
      const s = new MatchSimulator(input(`p${i}`, { knockout: true }), P);
      const parts = [...s.simulateUntil(30), ...s.simulateUntil(90), ...s.simulateUntil(s.regularDuration), ...s.simulateUntil(105), ...s.simulateUntil(500)];
      expect(parts).toEqual(whole.events);
      expect(s.summary()).toEqual(whole.summary);
    }
    expect(found).toBe(4);
  });

  it("os penáltis dependem do jogo (estável) e da qualidade dos marcadores", () => {
    const strong = syntheticTeam("A", 10, { penalties: 20 });
    const weak = syntheticTeam("B", 10, { penalties: 1 });
    let strongWins = 0;
    let n = 0;
    for (let i = 0; i < 1500 && n < 120; i++) {
      const r = simulateMatch({ seed: "pk", id: `q${i}`, home: strong, away: weak, knockout: true, neutral: true }, P);
      if (!r.summary.shootout) continue;
      n++;
      if (r.summary.shootout.home > r.summary.shootout.away) strongWins++;
      expect(simulateMatch({ seed: "pk", id: `q${i}`, home: strong, away: weak, knockout: true, neutral: true }, P).summary.shootout).toEqual(r.summary.shootout);
    }
    expect(n).toBeGreaterThanOrEqual(100);
    expect(strongWins / n).toBeGreaterThan(0.6);
  });

  it("segunda mão: o agregado decide (os golos da primeira mão contam para o empate)", () => {
    let carriedTies = 0;
    for (let i = 0; i < 120; i++) {
      const plain = simulateMatch(input(`a${i}`), P).summary;
      // a casa perdia 0-1 da primeira mão: se este jogo acaba 1-0 para a casa, o agregado está empatado
      const second = simulateMatch(input(`a${i}`, { knockout: true, carry: { home: 0, away: 1 } }), P).summary;
      const aggregateLevel = plain.home.goals + 0 === plain.away.goals + 1;
      expect(second.extraTime).toBe(aggregateLevel);
      if (aggregateLevel) carriedTies++;
    }
    expect(carriedTies).toBeGreaterThan(10);
  });

  it("campo neutro tira a vantagem da casa", () => {
    const points = (neutral: boolean) => {
      let p = 0;
      for (let i = 0; i < 1500; i++) {
        const s = simulateMatch(input(`h${i}`, { neutral }), P).summary;
        p += s.home.goals > s.away.goals ? 3 : s.home.goals === s.away.goals ? 1 : 0;
      }
      return p / 1500;
    };
    expect(points(false)).toBeGreaterThan(points(true) + 0.05);
  });
});
