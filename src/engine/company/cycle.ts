/**
 * Ciclo das empresas (RZ-219, RZ-311): criação no arranque do mundo e evolução no fim de cada época
 * (capital, falências, novas empresas) seguida dos patrocínios (renovações e novos contratos).
 */
import { Rng, clamp } from "../random/rng";
import type { Params, Tier } from "../config/parameters";
import type { BaseData } from "../data/types";
import { cityHistory } from "../city/cities";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord, IsoDate, PersonRecord, RoleRecord } from "../persistence/types";
import { createCompany, createNationalBroadcaster, createOwner, targetCompanies } from "./generate";
import { localJobsOf } from "./employment";
import { fillSponsorships, renewSponsorships } from "./sponsorship";
import { auctionRights } from "../broadcast/rights";

export type CompanyCycleSummary = { founded: number; closed: number; renewed: number; lapsed: number; signed: number };

const companyId = (n: number) => `co${String(n).padStart(5, "0")}`;
const personId = (n: number) => `p${String(n).padStart(6, "0")}`;

/** Cria as empresas de arranque (uma por dono existente, depois donos novos) e os primeiros patrocínios. */
export function startCompanies(repo: Repository, data: BaseData, params: Params, o: { seasonStart: IsoDate; year: number; tiers: ReadonlyMap<string, Tier> }): { companies: number; sponsorships: number } {
  const seed = repo.meta("seed") ?? "?";
  const people: PersonRecord[] = [];
  const roles: RoleRecord[] = [];
  const companies: CompanyRecord[] = [];
  let nextPerson = repo.peopleTotal();
  for (const city of [...data.cities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const rng = new Rng(seed, `company/start/${city.id}`);
    const existing = repo.publicRoles({ city: city.id }).filter((p) => p.fn === "businessperson");
    const n = targetCompanies(city, params);
    for (let i = 0; i < n; i++) {
      let owner: PersonRecord;
      const known = existing[i];
      if (known) owner = repo.person(known.id) as PersonRecord;
      else {
        const created = createOwner(rng, personId(++nextPerson), city, o.seasonStart, params);
        people.push(created.person);
        roles.push(created.role);
        owner = created.person;
      }
      companies.push(createCompany(rng, { id: companyId(companies.length + 1), city, owner, year: o.year, foundedBefore: rng.integer(0, 40) }, params));
    }
  }
  // emissoras nacionais, na maior cidade
  const capital = [...data.cities].sort((a, b) => b.population - a.population || (a.id < b.id ? -1 : 1))[0];
  if (capital) {
    const rng = new Rng(seed, "company/national");
    for (const spec of params.broadcast.national) {
      const created = createOwner(rng, personId(++nextPerson), capital, o.seasonStart, params);
      people.push(created.person);
      roles.push(created.role);
      companies.push(createNationalBroadcaster(rng, { id: companyId(companies.length + 1), city: capital, owner: created.person, year: o.year, spec }));
    }
  }
  repo.addPeople({ people, players: [], contracts: [], roles });
  repo.saveCompanies(companies);
  repo.setMeta("companies.enabled", "1");
  const sponsorships = fillSponsorships(repo, data, params, { season: 1, start: o.seasonStart, tiers: o.tiers });
  auctionRights(repo, data, params, { season: 1, start: o.seasonStart, tiers: o.tiers });
  return { companies: companies.length, sponsorships };
}

/** Fim de época: evolução das empresas e depois patrocínios. */
export function rolloverCompanies(repo: Repository, data: BaseData, params: Params, o: { season: number; seasonStart: IsoDate; year: number; tiers: ReadonlyMap<string, Tier>; previousTiers: ReadonlyMap<string, Tier> }): CompanyCycleSummary {
  if (repo.meta("companies.enabled") !== "1") return { founded: 0, closed: 0, renewed: 0, lapsed: 0, signed: 0 };
  const seed = repo.meta("seed") ?? "?";
  const ev = params.companies.evolution;
  const summary: CompanyCycleSummary = { founded: 0, closed: 0, renewed: 0, lapsed: 0, signed: 0 };
  const economyOf = new Map<string, number>();
  const economy = (city: string) => {
    let v = economyOf.get(city);
    if (v === undefined) {
      v = cityHistory(repo, data, params, city).at(-1)?.state.economy ?? 50;
      economyOf.set(city, v);
    }
    return v;
  };
  const event = (type: string, company: string, data0: Record<string, unknown>) =>
    repo.appendEvent({ type, date: o.seasonStart, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "company", id: company, roleKind: "company" }], data: data0 });

  // empresa grande a abrir ou a fechar: acontecimento da cidade (o efeito vem dos empregos, não do acontecimento; RZ-235)
  const cityNews = (type: "factory_closes" | "factory_opens", c: CompanyRecord) => {
    if (localJobsOf(c, params) < params.companies.city.jobs.eventJobs) return;
    repo.appendEvent({ type: "CITY_EVENT", date: o.seasonStart, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "city", id: c.city, roleKind: "afetada" }, { k: "company", id: c.id, roleKind: "company" }], data: { event: type, regional: false, company: c.id } });
  };

  // 1. evolução do capital e falências
  for (const c of repo.companies({ state: "active" })) {
    const rng = new Rng(seed, `company/evolve/${o.season}/${c.id}`);
    const capital = Math.max(1000, Math.round(c.capital * Math.exp(ev.growth + (ev.economyEffect * (economy(c.city) - 50)) / 50 + rng.gauss(0, ev.sigma))));
    const low = capital < params.companies.capital.median[c.scale] * ev.lowCapitalShare;
    if (rng.prob(clamp(ev.closureProbability + (low ? ev.lowCapitalClosure : 0), 0, 1))) {
      repo.updateCompany(c.id, { capital, state: "closed" });
      for (const s of repo.companySponsorships(c.id)) {
        repo.endSponsorship(s.id, o.seasonStart);
        repo.appendEvent({
          type: "SPONSORSHIP_ENDED", date: o.seasonStart, season: o.season, visibility: "exposed", origin: "generated",
          entities: [{ k: "company", id: c.id, roleKind: "sponsor" }, { k: "club", id: s.club, roleKind: "sponsored" }], data: { kind: s.kind, reason: "closure" },
        });
      }
      event("COMPANY_CLOSED", c.id, { sector: c.sector, scale: c.scale });
      cityNews("factory_closes", c);
      summary.closed++;
    } else repo.updateCompany(c.id, { capital });
  }

  // 2. novas empresas onde faltam (a cidade tem um número que sustenta)
  const active = new Map<string, number>();
  for (const c of repo.companies({ state: "active" })) active.set(c.city, (active.get(c.city) ?? 0) + 1);
  let nextCompany = repo.companies().length;
  let nextPerson = repo.peopleTotal();
  const people: PersonRecord[] = [];
  const roles: RoleRecord[] = [];
  const fresh: CompanyRecord[] = [];
  for (const city of [...data.cities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const rng = new Rng(seed, `company/found/${o.season}/${city.id}`);
    const missing = targetCompanies(city, params) - (active.get(city.id) ?? 0);
    for (let i = 0; i < missing; i++) {
      if (!rng.prob(ev.foundingRate)) continue;
      const created = createOwner(rng, personId(++nextPerson), city, o.seasonStart, params);
      people.push(created.person);
      roles.push(created.role);
      fresh.push(createCompany(rng, { id: companyId(++nextCompany), city, owner: created.person, year: o.year }, params));
    }
  }
  if (fresh.length > 0) {
    repo.addPeople({ people, players: [], contracts: [], roles });
    repo.saveCompanies(fresh);
    for (const c of fresh) { event("COMPANY_FOUNDED", c.id, { sector: c.sector, scale: c.scale, city: c.city }); cityNews("factory_opens", c); }
    summary.founded = fresh.length;
  }

  // 3. patrocínios: renovar o que acabou e preencher o que falta
  const ctx = { season: o.season, start: o.seasonStart, tiers: o.tiers };
  const renewal = renewSponsorships(repo, data, params, { ...ctx, previousTiers: o.previousTiers });
  summary.renewed = renewal.renewed;
  summary.lapsed = renewal.lapsed;
  summary.signed = fillSponsorships(repo, data, params, ctx);
  auctionRights(repo, data, params, { ...ctx, forSeason: o.season + 1 });
  repo.setMeta(`companies.${o.season}`, JSON.stringify(summary));
  return summary;
}
