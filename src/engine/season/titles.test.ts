import { describe, expect, it } from "vitest";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import { clinchedChampion } from "./titles";

const params = { standings: { winPoints: 3, drawPoints: 1 } } as Params;
/** Liga de 4 clubes, a duas voltas (12 jogos, 3 por clube cada volta → 6 por clube). */
const repo = (points: Record<string, [number, number]>): Repository => {
  const ids = Object.keys(points);
  const matches = ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => ({ home: h, away: a })));
  return {
    standings: () => ids.map((club) => ({ club, points: points[club]![0], matches: points[club]![1] })),
    calendar: () => ({ matches, byes: [] }),
  } as unknown as Repository;
};

describe("campeão matemático", () => {
  it("ainda há pontos por disputar que permitem apanhar o líder", () => {
    expect(clinchedChampion(repo({ a: [10, 4], b: [7, 4], c: [3, 4], d: [1, 4] }), params, "L", 1)).toBeUndefined();
  });
  it("ninguém alcança o líder, mesmo ganhando tudo o que falta", () => {
    expect(clinchedChampion(repo({ a: [16, 6], b: [4, 4], c: [3, 4], d: [1, 4] }), params, "L", 1)).toBe("a");
    // b ainda joga 2 jogos: 4 + 6 = 10 < 16
  });
  it("empate nos pontos possíveis não chega (podem decidir os desempates)", () => {
    expect(clinchedChampion(repo({ a: [10, 4], b: [4, 4], c: [3, 4], d: [1, 4] }), params, "L", 1)).toBeUndefined();
  });
  it("sem classificação não há campeão", () => {
    expect(clinchedChampion(repo({ a: [0, 0] }), params, "L", 1)).toBeUndefined();
  });
});
