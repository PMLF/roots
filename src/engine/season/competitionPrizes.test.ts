import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import type { BaseCity } from "../data/types";
import { districtFactors, finalistValue, prizeValue } from "./competitionPrizes";

const city = (district: string, budget: number, support: number): BaseCity => ({ id: `${district}${budget}`, name: "x", district, population: 1, sector: "", tag2: "", hub: "", island: false, municipalBudget: budget, mayor: { name: "a", traits: { ambition: 1, vanity: 1, patience: 1, integrity: 1 }, sportSupport: support }, footballCulture: 50, clubs: [] });

describe("premiosCompeticao", () => {
  const p = DEFAULT_PARAMETERS;
  it("valores fixos das ligas e do CP", () => {
    expect(prizeValue("firstLeague", p)).toBe(10_000_000);
    expect(prizeValue("cpSeries", p) + prizeValue("cpWinner", p)).toBe(200_000);
  });
  it("distritais escalam com o fator, dentro dos limites", () => {
    const f = districtFactors([city("A", 1e6, 2), city("B", 1e7, 8), city("C", 5e6, 5)], p);
    expect(f.get("A")!).toBeLessThan(f.get("C")!);
    expect(f.get("C")!).toBeLessThan(f.get("B")!);
    for (const v of f.values()) { expect(v).toBeGreaterThanOrEqual(p.prizes.districtFactor.min); expect(v).toBeLessThanOrEqual(p.prizes.districtFactor.max); }
    expect(prizeValue("district", p, 2)).toBe(10_000);
    expect(prizeValue("cpSeries", p, 2)).toBe(100_000);
  });
  it("finalista vencido recebe 25 %", () => {
    expect(finalistValue(2_000_000, p)).toBe(500_000);
  });
});
