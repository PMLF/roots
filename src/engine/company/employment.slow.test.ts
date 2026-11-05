import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { cityStateNow, evolveCities } from "../city/cities";
import { addDays } from "../calendar/dates";
import { data, fresh } from "../squad/testWorld.testlib";
import type { IsoDate } from "../persistence/types";
import { rolloverCompanies, startCompanies } from "./cycle";
import { cityJobs } from "./employment";

const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));

describe("empresas e cidade ao longo das épocas (RZ-235)", { timeout: 600000 }, () => {
  it("o emprego e a economia não divergem e as cidades pequenas não morrem em 20 épocas", () => {
    const repo = fresh("emp-slow");
    startCompanies(repo, data, P, { seasonStart: "2026-07-01", year: 2026, tiers });
    const mean = (f: (id: string) => number) => data.cities.reduce((s, c) => s + f(c.id), 0) / data.cities.length;
    const emp0 = mean((id) => cityStateNow(repo, data, P, id)!.employment);
    let closed = 0, founded = 0;
    for (let s = 1; s <= 20; s++) {
      const day = addDays("2026-06-30" as IsoDate, (s - 1) * 365);
      evolveCities(repo, data, P, s, day, new Map());
      const r = rolloverCompanies(repo, data, P, { season: s, seasonStart: addDays(day, 1), year: 2026 + s, tiers, previousTiers: tiers });
      closed += r.closed; founded += r.founded;
    }
    const emp = data.cities.map((c) => cityStateNow(repo, data, P, c.id)!.employment);
    const eco = data.cities.map((c) => cityStateNow(repo, data, P, c.id)!.economy);
    const m = emp.reduce((a, b) => a + b, 0) / emp.length;
    expect(Math.abs(m - emp0)).toBeLessThan(12);
    expect(emp.filter((x) => x >= 99).length).toBeLessThan(data.cities.length * 0.05);
    expect(emp.filter((x) => x <= 1).length).toBeLessThan(data.cities.length * 0.05);
    expect(eco.reduce((a, b) => a + b, 0) / eco.length).toBeGreaterThan(25);
    for (const c of data.cities) expect(cityStateNow(repo, data, P, c.id)!.population).toBeGreaterThanOrEqual(50);
    // há movimento de empresas: fecham e abrem, e há cidades com dependência alta
    expect(closed).toBeGreaterThan(0);
    expect(founded).toBeGreaterThan(0);
    expect(data.cities.some((c) => cityJobs(repo, P, c.id).dependence === "high")).toBe(true);
  });
});
