import { describe, expect, it } from "vitest";
import type { LiveMatch } from "@/engine/epoca/jogoAoVivo";
import type { SideStat } from "@/engine/jogo/tipos";
import { matchStatistics, scorerAt, liveTable } from "./vistaJogo";

const side = (x: Partial<SideStat>): SideStat => ({ goals: 0, chances: 0, shots: 0, onTarget: 0, blocked: 0, xg: 0, corners: 0, fouls: 0, possessionMinutes: 0, yellows: 0, reds: 0, injuries: 0, ...x });

describe("vista do jogo", () => {
  it("estatísticas: 14 linhas, derivadas coerentes e posse a somar 100%", () => {
    const l = matchStatistics({ home: side({ shots: 10, onTarget: 5, blocked: 2, goals: 2 }), away: side({ shots: 4, onTarget: 3, blocked: 0, goals: 1 }), homePossession: 0.6 });
    expect(l).toHaveLength(14);
    const por = Object.fromEntries(l.map((x) => [x.rowKey, x]));
    expect(por.fora).toMatchObject({ home: 3, away: 1 });
    expect(por.precisao).toMatchObject({ home: 0.5, away: 0.75 });
    expect(por.defesas).toMatchObject({ home: 2, away: 3 }); // casa defendeu 3-1 do adversário; fora defendeu 5-2
    expect(por.posse!.home + por.posse!.away).toBeCloseTo(1);
  });

  it("marcador e tabela ao vivo somam só o que já aconteceu", () => {
    expect(scorerAt([{ minute: 10, side: "home" }, { minute: 50, side: "away" }], 30)).toEqual([1, 0]);
    const match = {
      home: { id: "A", name: "A" }, away: { id: "B", name: "B" }, winPoints: 3, drawPoints: 1, lines: [{ minute: 10, type: "goal", side: "home", important: true, homeGoals: 1, awayGoals: 0 }],
      others: [{ id: "x", home: { id: "C", name: "C" }, away: { id: "D", name: "D" }, duration: 90, goals: [{ minute: 20, side: "away" }], homeGoals: 0, awayGoals: 1 }],
      table: ["A", "B", "C", "D"].map((c) => ({ club: c, name: c, matches: 0, points: 0, scoredGoals: 0, concededGoals: 0 })),
    } as unknown as LiveMatch;
    const aos15 = Object.fromEntries(liveTable(match, 15).map((l) => [l.club, l.points]));
    expect(aos15).toEqual({ A: 3, B: 0, C: 1, D: 1 });
    const aos25 = Object.fromEntries(liveTable(match, 25).map((l) => [l.club, l.points]));
    expect(aos25).toEqual({ A: 3, B: 0, C: 0, D: 3 });
  });
});
