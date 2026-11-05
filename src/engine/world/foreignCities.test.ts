import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importCountries } from "./countries";
import { foreignClubs } from "./foreign";
import { FOREIGN_NAMING } from "./foreignCities";
import { readFileSync } from "node:fs";

describe("clubes estrangeiros com cidades reais (RZ-264)", () => {
  it("há cidades que cheguem para todos os clubes de cada país", () => {
    for (const [country, n] of Object.entries(P.world.foreignLeagues.clubs)) {
      expect(FOREIGN_NAMING[country], country).toBeDefined();
      expect(FOREIGN_NAMING[country]!.cities.length, country).toBeGreaterThanOrEqual(n);
    }
  });
  it("o nome de cada clube inclui a sua cidade e não se repete", () => {
    const imported = importCountries(readFileSync("data/countries.csv", "utf8"));
    if (!imported.ok) throw new Error(imported.errors.join());
    const countries = imported.countries;
    const clubs = foreignClubs("s", countries, P);
    expect(clubs.length).toBeGreaterThan(100);
    const names = new Set(clubs.map((c) => c.name));
    expect(names.size).toBe(clubs.length);
    const byCountry = new Map<string, string[]>();
    for (const c of clubs) byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c.name]);
    for (const [country, list] of byCountry) list.forEach((name, i) => expect(name, `${country}/${i}`).toContain(FOREIGN_NAMING[country]!.cities[i]!));
    expect(clubs.find((c) => c.id === "x-gb-01")!.name).toContain("Londres");
    expect(clubs.find((c) => c.id === "x-es-02")!.name).toContain("Barcelona");
  });
});
