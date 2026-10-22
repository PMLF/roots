import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { startCompanies } from "./cycle";
import { sponsorTargets } from "./sponsorship";

const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));

describe("patrocínios por dimensão e reputação (RZ-311)", { timeout: 120000 }, () => {
  const repo = fresh("spons-cov");
  startCompanies(repo, data, P, { seasonStart: "2026-07-01", year: 2026, tiers });
  const rows = data.clubs.map((c) => {
    const list = repo.clubSponsorships(c.id, "2026-07-02").filter((x) => x.kind !== "broadcast");
    return { club: c, n: list.length, total: list.reduce((t, x) => t + x.annualValue, 0) };
  });

  it("todos os clubes têm pelo menos um patrocínio", () => {
    expect(rows.filter((r) => r.n === 0).map((r) => r.club.id)).toEqual([]);
  });

  it("os contratos fechados correspondem ao alvo do clube", () => {
    for (const r of rows) expect(r.n).toBeLessThanOrEqual([...sponsorTargets(r.club, r.club.tier, P).values()].reduce((a, b) => a + b, 0));
  });

  it("mais reputação dentro do escalão: mais contratos e mais dinheiro", () => {
    for (const tier of ["firstLeague", "secondLeague", "thirdLeague", "cp"] as const) {
      const t = rows.filter((r) => r.club.tier === tier).sort((a, b) => a.club.reputation - b.club.reputation);
      if (t[0]!.club.reputation === t[t.length - 1]!.club.reputation) continue; // sem dispersão de reputação no escalão
      const q = Math.max(1, Math.floor(t.length / 4));
      const avg = (xs: typeof t, f: (r: (typeof t)[number]) => number) => xs.reduce((s, r) => s + f(r), 0) / xs.length;
      expect(avg(t.slice(-q), (r) => r.n)).toBeGreaterThanOrEqual(avg(t.slice(0, q), (r) => r.n));
      expect(avg(t.slice(-q), (r) => r.total)).toBeGreaterThan(avg(t.slice(0, q), (r) => r.total));
    }
  });

  it("o escalão e a dimensão contam: 1.ª Liga recebe muito mais que distrital", () => {
    const m = (tier: string) => { const t = rows.filter((r) => r.club.tier === tier); return t.reduce((s, r) => s + r.total, 0) / t.length; };
    expect(m("firstLeague")).toBeGreaterThan(m("secondLeague") * 1.5);
    expect(m("cp")).toBeGreaterThan(m("district") * 2);
    console.log("PATROCÍNIOS", Object.fromEntries(["firstLeague", "secondLeague", "thirdLeague", "cp", "district"].map((t) => { const x = rows.filter((r) => r.club.tier === t); return [t, { clubes: x.length, contratosMedia: +(x.reduce((s, r) => s + r.n, 0) / x.length).toFixed(2), eurosMedia: Math.round(x.reduce((s, r) => s + r.total, 0) / x.length), maxContratos: Math.max(...x.map((r) => r.n)) }]; })));
  });
});
