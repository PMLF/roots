import { describe, expect, it } from "vitest";
import { showEstimate, showExact } from "./valor";

describe("valores conhecidos e estimados", () => {
  it("exact", () => expect(showExact(14)).toEqual({ state: "exact", text: "14" }));
  it("estimativa com intervalo", () => {
    expect(showEstimate({ value: 15, margin: 1.4, halfTime: [13.6, 16.4] })).toEqual({ state: "estimado", text: "≈ 14-16" });
  });
  it("intervalo estreito vira um só número", () => {
    expect(showEstimate({ value: 12, margin: 0.2, halfTime: [11.8, 12.2] }).text).toBe("≈ 12");
  });
  it("desatualizado guarda as épocas", () => {
    expect(showEstimate({ value: 15, margin: 2, halfTime: [13, 17] }, { outdated: true, sinceSeasons: 3 })).toEqual({ state: "outdated", text: "≈ 13-17", sinceSeasons: 3 });
  });
});
