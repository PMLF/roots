/**
 * Patrocínios de clubes por empresas (RZ-311). O valor total que um clube pode obter por ano continua a vir de
 * `annualFixedRevenues` (escalão × reputação), mas agora está repartido por contratos reais com empresas concretas,
 * por tipo (camisola, estádio, formação), com duração, renovação e rescisão quando a empresa fecha.
 */
import { Rng, clamp } from "../random/rng";
import { createDate } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { annualFixedRevenues } from "../club/finances";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord, IsoDate, SponsorshipKind, SponsorshipRecord } from "../persistence/types";
import { SECTOR_INFO, type CompanySector } from "./sectors";

export type SponsorContext = {
  season: number;
  /** Primeiro dia dos contratos novos (início da época). */
  start: IsoDate;
  tiers: ReadonlyMap<string, Tier>;
};

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

/** Valor anual de referência de um tipo de patrocínio num clube (sem ruído). */
export function referenceValue(club: BaseClub, tier: Tier, kind: SponsorshipKind, params: Params): number {
  const s = params.companies.sponsorship;
  const total = annualFixedRevenues({ ...club, tier }, params).sponsorships;
  const shareSum = s.slots[tier].reduce((t, k) => t + s.kindShare[k], 0);
  return (total * s.kindShare[kind]) / shareSum;
}

type Pool = {
  repo: Repository;
  data: BaseData;
  params: Params;
  districtOfCity: Map<string, string>;
  companies: CompanyRecord[];
  committed: Map<string, number>;
};

export function makePool(repo: Repository, data: BaseData, params: Params, on: IsoDate): Pool {
  const committed = new Map<string, number>();
  for (const s of repo.activeSponsorships(on)) committed.set(s.company, (committed.get(s.company) ?? 0) + s.annualValue);
  return { repo, data, params, districtOfCity: new Map(data.cities.map((c) => [c.id, c.district] as const)), companies: repo.companies({ state: "active" }), committed };
}

function weightOf(pool: Pool, company: CompanyRecord, club: BaseClub, tier: Tier, desired: number, already: ReadonlySet<string>): number {
  const s = pool.params.companies.sponsorship;
  if (already.has(company.id)) return 0;
  const fit = s.scaleFit[tier][company.scale];
  const visibility = SECTOR_INFO[company.sector as CompanySector]?.visibility ?? 1;
  let prox = company.city === club.city ? s.proximity.city : pool.districtOfCity.get(company.city) === club.district ? s.proximity.district : s.proximity.elsewhere;
  if (company.scale === "national" || company.scale === "international") prox = Math.max(prox, s.proximity.nationalFloor);
  const room = company.capital * s.maxShareOfCapital - (pool.committed.get(company.id) ?? 0);
  const capacity = room >= desired ? 1 : room > 0 ? Math.max(0.05, room / desired) ** 1.5 : 0.01;
  return fit * visibility * prox * capacity;
}

const roundValue = (x: number) => Math.max(500, Math.round(x / 100) * 100);

function sign(pool: Pool, rng: Rng, club: BaseClub, tier: Tier, kind: SponsorshipKind, ctx: SponsorContext, already: Set<string>, keep?: CompanyRecord): SponsorshipRecord | undefined {
  const s = pool.params.companies.sponsorship;
  const desired = referenceValue(club, tier, kind, pool.params) * Math.exp(rng.gauss(0, s.valueSigma));
  const company = keep ?? (pool.companies.length === 0 ? undefined : rng.weighted(pool.companies, (c) => weightOf(pool, c, club, tier, desired, already)));
  if (!company || already.has(company.id)) return undefined;
  const room = Math.max(0, company.capital * s.maxShareOfCapital - (pool.committed.get(company.id) ?? 0));
  const value = roundValue(Math.min(desired, Math.max(room, desired * 0.35)));
  const years = rng.integer(s.yearsMin, s.yearsMax);
  const end = createDate(Number(ctx.start.slice(0, 4)) + years, 6, 30);
  const id = pool.repo.addSponsorship({ company: company.id, club: club.id, kind, annualValue: value, start: ctx.start, end });
  pool.committed.set(company.id, (pool.committed.get(company.id) ?? 0) + value);
  already.add(company.id);
  pool.repo.appendEvent({
    type: "SPONSORSHIP_SIGNED", date: ctx.start, season: ctx.season, visibility: "exposed", origin: "generated",
    entities: [{ k: "company", id: company.id, roleKind: "sponsor" }, { k: "club", id: club.id, roleKind: "sponsored" }],
    data: { kind, annualValue: value, years },
  });
  return { id, company: company.id, club: club.id, kind, annualValue: value, start: ctx.start, end };
}

/** Preenche os tipos de patrocínio que cada clube oferece e ainda não tem vigentes na data de início. */
export function fillSponsorships(repo: Repository, data: BaseData, params: Params, ctx: SponsorContext): number {
  const seed = repo.meta("seed") ?? "?";
  const pool = makePool(repo, data, params, ctx.start);
  const order = [...data.clubs].sort((a, b) => TIER_ORDER.indexOf(ctx.tiers.get(a.id) ?? a.tier) - TIER_ORDER.indexOf(ctx.tiers.get(b.id) ?? b.tier) || b.reputation - a.reputation || (a.id < b.id ? -1 : 1));
  let signed = 0;
  for (const club of order) {
    const tier = ctx.tiers.get(club.id) ?? club.tier;
    const current = repo.clubSponsorships(club.id, ctx.start);
    const have = new Set(current.map((x) => x.kind));
    const already = new Set(current.map((x) => x.company));
    const rng = new Rng(seed, `sponsorship/${ctx.season}/${club.id}`);
    for (const kind of params.companies.sponsorship.slots[tier]) {
      if (have.has(kind)) continue;
      if (sign(pool, rng, club, tier, kind, ctx, already)) signed++;
    }
  }
  return signed;
}

/**
 * Fim de época: os contratos que acabaram renovam-se com a mesma empresa (se ainda existe e quiser) ao valor de hoje do clube,
 * ou ficam livres para novos patrocinadores. Subir de escalão ajuda a renovar, descer prejudica.
 */
export function renewSponsorships(repo: Repository, data: BaseData, params: Params, ctx: SponsorContext & { previousTiers: ReadonlyMap<string, Tier> }): { renewed: number; lapsed: number } {
  const seed = repo.meta("seed") ?? "?";
  const s = params.companies.sponsorship;
  const pool = makePool(repo, data, params, ctx.start);
  const dayBefore = createDate(Number(ctx.start.slice(0, 4)), 6, 30);
  const expiring = repo.activeSponsorships(dayBefore).filter((x) => x.end < ctx.start).sort((a, b) => a.id - b.id);
  const clubs = new Map(data.clubs.map((c) => [c.id, c] as const));
  let renewed = 0;
  let lapsed = 0;
  for (const old of expiring) {
    const club = clubs.get(old.club);
    const company = repo.company(old.company);
    if (!club || !company) continue;
    const tier = ctx.tiers.get(club.id) ?? club.tier;
    const change = TIER_ORDER.indexOf(ctx.previousTiers.get(club.id) ?? tier) - TIER_ORDER.indexOf(tier);
    const p = clamp(s.renewBase + (change > 0 ? s.renewPromoted : change < 0 ? s.renewRelegated : 0), 0.02, 0.98);
    const rng = new Rng(seed, `sponsorship/renew/${ctx.season}/${old.id}`);
    const offered = s.slots[tier].includes(old.kind);
    const current = repo.clubSponsorships(club.id, ctx.start);
    const already = new Set(current.filter((x) => x.kind !== old.kind || x.company !== old.company).map((x) => x.company));
    if (company.state === "active" && offered && rng.prob(p) && sign(pool, rng, club, tier, old.kind, ctx, already, company)) {
      renewed++;
    } else {
      lapsed++;
      pool.repo.appendEvent({
        type: "SPONSORSHIP_ENDED", date: ctx.start, season: ctx.season, visibility: "exposed", origin: "generated",
        entities: [{ k: "company", id: company.id, roleKind: "sponsor" }, { k: "club", id: club.id, roleKind: "sponsored" }],
        data: { kind: old.kind, reason: company.state === "closed" ? "closure" : "expired" },
      });
    }
  }
  return { renewed, lapsed };
}
