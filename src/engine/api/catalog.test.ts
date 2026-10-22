import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { data } from "../squad/testWorld.testlib";
import { buildCatalog } from "./catalog";

describe("catálogo de clubes (RZ-138)", () => {
  const catalog = buildCatalog(data, P);
  it("só tem clubes jogáveis, todos com localidade, distrito e escalão", () => {
    expect(catalog.length).toBeGreaterThan(250);
    expect(new Set(catalog.map((c) => c.id)).size).toBe(catalog.length);
    for (const c of catalog) { expect(c.district.name).not.toBe(""); expect(c.locality.name).not.toBe(""); }
  });
  it("a dificuldade acompanha a dimensão: os da 1.ª Liga são maiores que os distritais", () => {
    const share = (tier: string, d: string) => catalog.filter((c) => c.tier === tier).filter((c) => c.difficulty === d).length / catalog.filter((c) => c.tier === tier).length;
    expect(share("firstLeague", "big")).toBeGreaterThan(share("district", "big"));
    expect(share("district", "underdog")).toBeGreaterThan(0.5);
    expect(new Set(catalog.map((c) => c.difficulty)).size).toBe(3);
  });
  it("as finanças repartem-se em três faixas dentro do escalão", () => {
    for (const tier of ["firstLeague", "cp", "district"] as const) {
      const set = new Set(catalog.filter((c) => c.tier === tier).map((c) => c.finances));
      expect(set.size).toBeGreaterThanOrEqual(2);
    }
  });
});
