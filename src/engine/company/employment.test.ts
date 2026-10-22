import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { addDays } from "../calendar/dates";
import { clubBalance } from "../club/finances";
import { data, fresh } from "../squad/testWorld.testlib";
import type { IsoDate } from "../persistence/types";
import { startCompanies } from "./cycle";
import { cityJobs, companyTargets, expectedOf, localJobsOf, partnerOffsets } from "./employment";
import { dailyPatrons, patronOffers, pendingPatrons, respondPatron } from "./patrons";

const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));
const world = (seed: string) => {
  const repo = fresh(seed);
  startCompanies(repo, data, P, { seasonStart: "2026-07-01", year: 2026, tiers });
  return repo;
};

describe("empresas e cidade (RZ-235)", { timeout: 120000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("os empregos locais crescem com a escala e uma empresa nacional pesa menos em cada cidade", () => {
    const small = { capital: 1_000_000, scale: "local" as const };
    expect(localJobsOf({ capital: 10_000_000, scale: "local" }, P)).toBeGreaterThan(localJobsOf(small, P));
    // 25 M€ de capital: nacional emprega mais gente no total, mas só uma parte no concelho
    expect(localJobsOf({ capital: 25_000_000, scale: "national" }, P)).toBeLessThan(25_000_000 / P.companies.capitalPerEmployee.national);
  });

  it("o esperado cresce com a população", () => {
    expect(expectedOf({ population: 200_000 }, P).jobs).toBeGreaterThan(expectedOf({ population: 5_000 }, P).jobs);
  });

  it("a dependência vem do maior empregador e os alvos ficam dentro dos limites", () => {
    const repo = world("emp-a");
    const k = P.companies.city.jobs;
    for (const c of data.cities) {
      const j = cityJobs(repo, P, c.id);
      expect(j.topShare).toBeGreaterThanOrEqual(0);
      expect(j.topShare).toBeLessThanOrEqual(1);
      if (j.topShare >= k.dependence[1]) expect(j.dependence).toBe("high");
      const t = companyTargets(repo, P, c.id, c.population);
      expect(Math.abs(t.employment)).toBeLessThanOrEqual(k.employmentMax + 1e-9);
      expect(Math.abs(t.economy)).toBeLessThanOrEqual(k.economyMax + 1e-9);
    }
  });

  it("fechar o maior empregador baixa o alvo do emprego", () => {
    const repo = world("emp-b");
    const city = data.cities.find((c) => cityJobs(repo, P, c.id).companies >= 3)!;
    const before = companyTargets(repo, P, city.id, city.population).employment;
    const top = cityJobs(repo, P, city.id).top!;
    repo.updateCompany(top.id, { state: "closed" });
    expect(companyTargets(repo, P, city.id, city.population).employment).toBeLessThan(before);
  });

  it("sem empresas no mundo não há efeito", () => {
    const repo = fresh("emp-c");
    expect(companyTargets(repo, P, data.cities[0]!.id, 10000)).toEqual({ employment: 0, economy: 0 });
  });

  it("parceiros de serviços só ajudam onde a Câmara deixa o serviço abaixo da média", () => {
    const repo = world("emp-d");
    const city = data.cities.find((c) => repo.companies({ city: c.id, state: "active" }).some((x) => x.sector === "health" || x.sector === "transport" || x.sector === "energy" || x.sector === "media"))!;
    expect(Object.values(partnerOffsets(repo, P, city.id, { health: 1.5, mobility: 1.5, safety: 1.5, entertainment: 1.5 })).every((v) => (v ?? 0) === 0)).toBe(true);
    const low = partnerOffsets(repo, P, city.id, { health: 0.3, mobility: 0.3, safety: 0.3, entertainment: 0.3 });
    expect(Object.values(low).some((v) => (v ?? 0) > 0)).toBe(true);
    for (const v of Object.values(low)) expect(v ?? 0).toBeLessThanOrEqual(P.companies.city.partners.max + 1e-9);
  });
});

describe("mecenato (RZ-235)", { timeout: 120000 }, () => {
  const patronWorld = (seed: string) => {
    const repo = world(seed);
    const c = data.clubs.find((x) => repo.companies({ city: x.city, state: "active" }).length > 0 && x.tier === "district")!;
    return { repo, c };
  };
  const days = (repo: ReturnType<typeof world>, c: (typeof data.clubs)[number], from: IsoDate, n: number) => {
    for (let i = 0; i < n; i++) dailyPatrons(repo, { ...P, companies: { ...P.companies, city: { ...P.companies.city, patron: { ...P.companies.city.patron, dailyChance: 1 } } } }, c, addDays(from, i), 1);
  };

  it("uma proposta aparece, é uma só de cada vez e respeita o intervalo", () => {
    const { repo, c } = patronWorld("patron-a");
    days(repo, c, "2026-08-01", 3);
    expect(pendingPatrons(repo)).toHaveLength(1);
    expect(patronOffers(repo)).toHaveLength(1);
    expect(repo.eventsOf({ k: "club", id: c.id }).some((e) => e.type === "PATRON_OFFER")).toBe(true);
  });

  it("aceitar uma doação põe o dinheiro na caixa; recusar não mexe", () => {
    const { repo, c } = patronWorld("patron-b");
    days(repo, c, "2026-08-01", 1);
    const offer = pendingPatrons(repo)[0]!;
    const before = clubBalance(repo, c);
    if (offer.counterpart === "none") {
      expect(respondPatron(repo, c, "2026-08-02", offer.id, true)).toEqual({ ok: true });
      expect(clubBalance(repo, c)).toBe(before + offer.amount);
    } else {
      expect(respondPatron(repo, c, "2026-08-02", offer.id, true)).toEqual({ ok: true });
      expect(repo.clubSponsorships(c.id, "2026-08-02").some((s) => s.kind === "stadium" && s.company === offer.company)).toBe(true);
    }
    expect(respondPatron(repo, c, "2026-08-02", offer.id, true)).toEqual({ ok: false });
  });

  it("recusar fecha a proposta sem dinheiro", () => {
    const { repo, c } = patronWorld("patron-c");
    days(repo, c, "2026-08-01", 1);
    const offer = pendingPatrons(repo)[0]!;
    const before = clubBalance(repo, c);
    expect(respondPatron(repo, c, "2026-08-02", offer.id, false)).toEqual({ ok: true });
    expect(clubBalance(repo, c)).toBe(before);
    expect(pendingPatrons(repo)).toHaveLength(0);
  });

  it("as propostas por responder caducam", () => {
    const { repo, c } = patronWorld("patron-d");
    days(repo, c, "2026-08-01", 1);
    const offer = pendingPatrons(repo)[0]!;
    dailyPatrons(repo, P, c, addDays(offer.expires, 1), 1);
    expect(patronOffers(repo)[0]!.status).toBe("expired");
  });
});
