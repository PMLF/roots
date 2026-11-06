import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { potentialRange, referenceTier, starsOf } from "./stars";

describe("estrelas", () => {
  it("a média do escalão vale 3-3,5 estrelas e os valores vão de 0,5 a 5 de meia em meia", () => {
    const mean = starsOf(P.world.targetQuality.cp.mean, "cp", P);
    expect(mean).toBeGreaterThanOrEqual(3);
    expect(mean).toBeLessThanOrEqual(3.5);
    for (const q of [1, 3.3, 7.7, 12, 20]) {
      const s = starsOf(q, "district", P);
      expect(s).toBeGreaterThanOrEqual(0.5);
      expect(s).toBeLessThanOrEqual(5);
      expect(s * 2).toBe(Math.round(s * 2));
    }
  });
  it("escala de qualidade: 4 = muito bom para o escalão, 4,5-5 = devia estar acima (ou é dos melhores do mundo)", () => {
    const w = P.world.stars.pointsPerStar;
    const m = P.world.targetQuality.firstLeague.mean;
    expect(starsOf(m + 1 * w, "firstLeague", P)).toBeGreaterThanOrEqual(4);
    expect(starsOf(m + 0.5 * w, "firstLeague", P)).toBeLessThan(5);
    expect(starsOf(m + 2 * w, "firstLeague", P)).toBe(5);
    expect(starsOf(m - 1 * w, "firstLeague", P)).toBeLessThanOrEqual(2.5);
  });
  it("a mesma qualidade vale menos estrelas num escalão mais alto; um jogador de divisões inferiores é fraco para a 1.ª Liga", () => {
    const q = P.world.targetQuality.district.mean + 1.5 * P.world.stars.pointsPerStar;
    expect(starsOf(q, "cp", P)).toBeLessThan(starsOf(q, "district", P));
    expect(starsOf(q, "thirdLeague", P)).toBeLessThan(starsOf(q, "cp", P));
    expect(starsOf(P.world.targetQuality.thirdLeague.mean, "firstLeague", P)).toBeLessThanOrEqual(2);
    expect(starsOf(P.world.targetQuality.district.mean, "firstLeague", P)).toBeLessThanOrEqual(1.5);
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
