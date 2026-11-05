import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { potentialRange, referenceTier, starsOf } from "./stars";

describe("estrelas", () => {
  it("a média do escalão vale 2,5 e os valores vão de 0,5 a 5 de meia em meia", () => {
    expect(starsOf(P.world.targetQuality.cp.mean, "cp", P)).toBe(2.5);
    for (const q of [1, 3.3, 7.7, 12, 20]) {
      const s = starsOf(q, "district", P);
      expect(s).toBeGreaterThanOrEqual(0.5);
      expect(s).toBeLessThanOrEqual(5);
      expect(s * 2).toBe(Math.round(s * 2));
    }
  });
  it("a mesma qualidade vale menos estrelas num escalão mais alto: 5 nas distritais ≈ 3,5 no CP", () => {
    const q = P.world.targetQuality.district.mean + 2.5 * P.world.stars.pointsPerStar;
    expect(starsOf(q, "district", P)).toBe(5);
    expect(starsOf(q, "cp", P)).toBe(3.5);
    expect(starsOf(q, "cp", P)).toBeLessThan(starsOf(q, "district", P));
    expect(starsOf(q, "thirdLeague", P)).toBeLessThan(starsOf(q, "cp", P));
  });
  it("intervalo de potencial: ordenado e nunca abaixo do atual", () => {
    const r = potentialRange(8, 14, 10, "cp", P);
    expect(r.low).toBeGreaterThanOrEqual(starsOf(10, "cp", P));
    expect(r.high).toBeGreaterThanOrEqual(r.low);
  });
  it("sem clube usa o escalão dos livres", () => {
    expect(referenceTier(undefined, P)).toBe(P.world.stars.freeAgentTier);
    expect(referenceTier("cp", P)).toBe("cp");
  });
});
