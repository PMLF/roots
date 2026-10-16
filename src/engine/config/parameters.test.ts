import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, createParams, derived, validateParameters } from "./parameters";

describe("parâmetros padrão", () => {
  it("são coerentes", () => {
    expect(validateParameters(DEFAULT_PARAMETERS)).toEqual([]);
  });

  it("batem com o Clubs_Raizes.xlsx › Parâmetros (prémios, distritais, CP, promoção)", () => {
    const p = DEFAULT_PARAMETERS;
    expect({ club: p.prizes.club, city: p.prizes.city }).toEqual({ club: 2_000_000, city: 1_000_000 });
    expect([p.districtLeagues.target, p.districtLeagues.min, p.districtLeagues.max]).toEqual([10, 8, 14]);
    expect([p.pyramid.cp.series, p.pyramid.cp.clubsPerSeries, p.pyramid.promotion.promotedPerGroup, p.pyramid.districts]).toEqual([4, 10, 2, 20]);
  });

  it("derivam as contas da pirâmide: 8 promovidos, 8 descem do CP, 30 % de rotatividade", () => {
    const d = derived(DEFAULT_PARAMETERS);
    expect(d.promotedAtCp).toBe(8);
    expect(d.cpDrop).toBe(8);
    expect(d.dropPerMeanSeries).toBe(2);
    expect(d.cpOutputPercentage).toBeCloseTo(0.3, 5);
  });
});

describe("createParams", () => {
  it("funde alterações parciais sem mexer no resto", () => {
    const p = createParams({ prizes: { club: 3_000_000 }, saves: { daysAutosave: 14 } });
    expect(p.prizes.club).toBe(3_000_000);
    expect(p.prizes.city).toBe(1_000_000);
    expect(p.saves.daysAutosave).toBe(14);
    expect(p.saves.rotatingAutosaves).toBe(3);
    expect(DEFAULT_PARAMETERS.prizes.club).toBe(2_000_000);
  });

  it("recusa configurações incoerentes", () => {
    expect(() => createParams({ districtLeagues: { min: 12 } })).toThrow(/distritais/);
    expect(() => createParams({ pyramid: { promotion: { groups: 5 } } })).toThrow(/promotion\.groups/);
    expect(() => createParams({ finances: { wealthPercentiles: [50, 70, 40, 15] } })).toThrow(/wealthPercentiles/);
  });

  it("aceita variantes válidas de PROMO_POR_GRUPO (1 a 3) e recalcula as descidas do CP", () => {
    expect(derived(createParams({ pyramid: { promotion: { promotedPerGroup: 1 } } })).cpDrop).toBe(4);
    expect(derived(createParams({ pyramid: { promotion: { promotedPerGroup: 3 } } })).cpDrop).toBe(12);
  });
});
